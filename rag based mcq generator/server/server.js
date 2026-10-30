
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 5000;
const AI_URL =
    process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";
const MAX_PDF_SIZE = 100 * 1024 * 1024;
const MAX_JSON_SIZE = "145mb";

app.use(cors({
    origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173"
}));
// Base64 increases a 100 MB PDF to about 134 MB, plus JSON overhead.
app.use(express.json({ limit: MAX_JSON_SIZE }));

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_PDF_SIZE },
    fileFilter: (req, file, cb) => {
        const valid =
            file.mimetype === "application/pdf" ||
            file.originalname.toLowerCase().endsWith(".pdf");

        cb(valid ? null : new Error("Only PDF files are allowed."), valid);
    }
});

// Demo storage: data is lost when the server restarts.
const documents = new Map();
const quizzes = new Map();

app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
});

// 1. Upload and process PDF
app.post("/api/upload", upload.single("file"), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "Please upload a PDF." });
    }

    const documentId = crypto.randomUUID();

    try {
        const response = await axios.post(`${AI_URL}/process`, {
            document_id: documentId,
            filename: req.file.originalname,
            pdf_base64: req.file.buffer.toString("base64")
        }, {
            timeout: 120000,
            maxBodyLength: 145 * 1024 * 1024,
            maxContentLength: 145 * 1024 * 1024
        });

        documents.set(documentId, {
            status: "ready",
            chunks: Number(response.data.chunks) || 0
        });

        res.json({
            document_id: documentId,
            status: "ready",
            chunks: Number(response.data.chunks) || 0
        });
    } catch (err) {
        res.status(502).json({
            error: err.response?.data?.error ||
                "Could not process PDF. Check whether Flask is running."
        });
    }
});

// 2. Check processing status
app.get("/api/status/:documentId", (req, res) => {
    const document = documents.get(req.params.documentId);

    if (!document) {
        return res.status(404).json({ error: "Document not found." });
    }

    res.json({
        document_id: req.params.documentId,
        ...document
    });
});

// 3. Generate exactly five questions
app.post("/api/quiz/generate", async (req, res) => {
    const { document_id } = req.body || {};

    if (!document_id || documents.get(document_id)?.status !== "ready") {
        return res.status(400).json({
            error: "Upload and process a PDF first."
        });
    }

    try {
        const response = await axios.post(
            `${AI_URL}/generate-quiz`,
            { document_id },
            { timeout: 120000 }
        );

        const questions = response.data?.questions;

        if (!Array.isArray(questions) || questions.length !== 5) {
            return res.status(502).json({
                error: "AI must return exactly five questions."
            });
        }

        // Validate the answer key before saving it.
        for (const q of questions) {
            if (
                typeof q !== "object" ||
                !q.question ||
                typeof q.question !== "string" ||
                !q.options ||
                !["A", "B", "C", "D"].every(
                    key => typeof q.options[key] === "string" &&
                        q.options[key].trim()
                ) ||
                !["A", "B", "C", "D"].includes(q.correct_answer)
            ) {
                return res.status(502).json({
                    error: "AI returned an invalid question."
                });
            }
        }

        quizzes.set(document_id, questions);

        // Never return correct_answer or explanation before submission.
        const safeQuestions = questions.map((q, i) => ({
            id: `q${i + 1}`,
            question: q.question,
            options: q.options
        }));

        res.json({ questions: safeQuestions });
    } catch (err) {
        res.status(502).json({
            error: err.response?.data?.error || "Quiz generation failed."
        });
    }
});

// 4. Evaluate submitted answers
app.post("/api/quiz/submit", (req, res) => {
    const { document_id, answers } = req.body || {};
    const questions = quizzes.get(document_id);

    if (!document_id || !documents.has(document_id) || !questions) {
        return res.status(400).json({
            error: "Generate a quiz before submitting."
        });
    }

    if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
        return res.status(400).json({ error: "Invalid answers." });
    }

    const results = questions.map((q, i) => {
        const id = `q${i + 1}`;
        const selected = answers[id];
        const validSelection = ["A", "B", "C", "D"].includes(selected);
        const selectedAnswer = validSelection ? selected : null;

        return {
            id,
            question: q.question,
            selected_answer: selectedAnswer,
            selected_text: selectedAnswer ? q.options[selectedAnswer] : null,
            correct_answer: q.correct_answer,
            correct_text: q.options[q.correct_answer],
            is_correct: selectedAnswer === q.correct_answer,
            explanation: q.explanation || ""
        };
    });

    const score = results.filter(q => q.is_correct).length;

    res.json({
        score,
        total: results.length,
        percentage: Math.round(score / results.length * 100),
        results
    });
});

app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError &&
        err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
            error: "PDF must be 100 MB or smaller."
        });
    }

    res.status(400).json({
        error: err.message || "Request failed."
    });
});

app.listen(PORT, () => {
    console.log(`Express running at http://localhost:${PORT}`);
});
