import { useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function App() {
    const [file, setFile] = useState(null);
    const [documentId, setDocumentId] = useState("");
    const [status, setStatus] = useState("Upload a PDF to begin");
    const [questions, setQuestions] = useState([]);
    const [answers, setAnswers] = useState({});
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    async function readResponse(response) {
        return response.json().catch(() => ({}));
    }

    async function uploadPDF() {
        if (!file) return setError("Please select a PDF.");

        setLoading(true);
        setError("");
        setQuestions([]);
        setResults(null);
        setStatus("Processing PDF...");

        try {
            const form = new FormData();
            form.append("file", file);
            const response = await fetch(`${API}/api/upload`, { method: "POST", body: form });
            const data = await readResponse(response);
            if (!response.ok) throw new Error(data.error || "Upload failed.");
            setDocumentId(data.document_id);
            setStatus(`Ready! ${data.chunks} chunks indexed.`);
        } catch (err) {
            setError(err.message || "Upload failed.");
            setStatus("Processing failed");
        } finally {
            setLoading(false);
        }
    }

    async function generateQuiz() {
        setLoading(true);
        setError("");
        try {
            const response = await fetch(`${API}/api/quiz/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ document_id: documentId })
            });
            const data = await readResponse(response);
            if (!response.ok) throw new Error(data.error || "Quiz generation failed.");
            setQuestions(data.questions);
            setAnswers({});
            setResults(null);
            setStatus("Quiz generated successfully!");
        } catch (err) {
            setError(err.message || "Quiz generation failed.");
        } finally {
            setLoading(false);
        }
    }

    async function submitQuiz() {
        if (Object.keys(answers).length !== questions.length) {
            setError(`Please answer all ${questions.length} questions before submitting.`);
            return;
        }

        setLoading(true);
        setError("");
        try {
            const response = await fetch(`${API}/api/quiz/submit`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ document_id: documentId, answers })
            });
            const data = await readResponse(response);
            if (!response.ok) throw new Error(data.error || "Evaluation failed.");
            setResults(data);
            setStatus("Quiz evaluated!");
        } catch (err) {
            setError(err.message || "Evaluation failed.");
        } finally {
            setLoading(false);
        }
    }

    function reset() {
        setFile(null);
        setDocumentId("");
        setQuestions([]);
        setAnswers({});
        setResults(null);
        setError("");
        setStatus("Upload a PDF to begin");
    }

    return (
        <>
            <style>{styles.css}</style>
            <main className="page">
                <header className="hero">
                    <div className="brand-mark">RQ</div>
                    <div>
                        <p className="eyebrow">AI-POWERED LEARNING</p>
                        <h1>RAG Quiz Generator</h1>
                        <p className="subtitle">Turn any PDF into a focused, intelligent quiz in seconds.</p>
                    </div>
                    <div className="hero-orb" />
                </header>

                <div className="steps">
                    <div className={!documentId ? "step active" : "step complete"}><span>1</span><strong>Upload</strong></div>
                    <div className={documentId && !questions.length && !results ? "step active" : questions.length || results ? "step complete" : "step"}><span>2</span><strong>Generate</strong></div>
                    <div className={questions.length && !results ? "step active" : results ? "step complete" : "step"}><span>3</span><strong>Attempt</strong></div>
                    <div className={results ? "step active" : "step"}><span>4</span><strong>Results</strong></div>
                </div>

                <section className="card upload-card">
                    <div className="section-heading">
                        <div className="number">01</div>
                        <div><p className="eyebrow">START HERE</p><h2>Upload your study material</h2></div>
                    </div>
                    <label className="dropzone">
                        <input type="file" accept=".pdf,application/pdf" onChange={event => setFile(event.target.files?.[0] || null)} />
                        <span className="upload-icon">↑</span>
                        <strong>{file ? file.name : "Choose a PDF file"}</strong>
                        <small>{file ? "Ready to process" : "Drag and drop or browse from your device"}</small>
                    </label>
                    <div className="actions">
                        <button className="primary-button" disabled={!file || loading} onClick={uploadPDF}>
                            {loading ? <><span className="spinner" /> Processing...</> : "Upload & Process"}
                        </button>
                        <button className="ghost-button" onClick={reset}>Reset</button>
                    </div>
                    <p className="status"><span className="status-dot" />{status}</p>
                </section>

                {error && <p className="error"><strong>Something went wrong</strong><span>{error}</span></p>}

                {documentId && questions.length === 0 && !results && (
                    <section className="card generate-card">
                        <div className="section-heading">
                            <div className="number">02</div>
                            <div><p className="eyebrow">READY TO GO</p><h2>Create your quiz</h2></div>
                        </div>
                        <p className="muted">Your document is indexed. Generate five questions based entirely on its content.</p>
                        <button className="primary-button" disabled={loading} onClick={generateQuiz}>
                            {loading ? <><span className="spinner" /> Generating...</> : "Generate 5 Questions  →"}
                        </button>
                    </section>
                )}

                {questions.length > 0 && !results && (
                    <section className="card quiz-card">
                        <div className="quiz-header">
                            <div><p className="eyebrow">YOUR QUIZ</p><h2>Test your knowledge</h2></div>
                            <div className="answer-count">{Object.keys(answers).length}<span>/</span>{questions.length}<small>answered</small></div>
                        </div>
                        {questions.map((question, index) => (
                            <article key={question.id} className="question">
                                <div className="question-label">QUESTION {String(index + 1).padStart(2, "0")}</div>
                                <h3>{question.question}</h3>
                                <div className="options">
                                    {Object.entries(question.options).map(([key, value]) => (
                                        <label key={key} className={`option ${answers[question.id] === key ? "selected" : ""}`}>
                                            <input type="radio" name={question.id} checked={answers[question.id] === key} onChange={() => setAnswers(prev => ({ ...prev, [question.id]: key }))} />
                                            <span className="option-key">{key}</span><span>{value}</span>
                                        </label>
                                    ))}
                                </div>
                            </article>
                        ))}
                        <button className="primary-button submit-button" disabled={loading || Object.keys(answers).length !== questions.length} onClick={submitQuiz}>
                            {loading ? <><span className="spinner" /> Checking...</> : `Submit Quiz  ·  ${Object.keys(answers).length}/${questions.length}`}
                        </button>
                    </section>
                )}

                {results && (
                    <section className="card results-card">
                        <div className="result-banner">
                            <div><p className="eyebrow">QUIZ COMPLETE</p><h2>Great work!</h2><p>Here is your performance breakdown.</p></div>
                            <div className="score"><strong>{results.percentage}%</strong><span>{results.score} of {results.total} correct</span></div>
                        </div>
                        {results.results.map((result, index) => (
                            <article key={result.id} className={`question result-question ${result.is_correct ? "correct" : "incorrect"}`}>
                                <div className="question-label">QUESTION {String(index + 1).padStart(2, "0")} <span>{result.is_correct ? "Correct" : "Review"}</span></div>
                                <h3>{result.question}</h3>
                                <p className="answer-line"><strong>Your answer:</strong> {result.selected_answer ? `${result.selected_answer}. ${result.selected_text}` : "Not answered"}</p>
                                <p className="answer-line"><strong>Correct answer:</strong> {result.correct_answer}. {result.correct_text}</p>
                                <p className="explanation">{result.explanation}</p>
                            </article>
                        ))}
                        <button className="primary-button" onClick={reset}>Start New Quiz  →</button>
                    </section>
                )}
            </main>
        </>
    );
}

const styles = {
    css: `
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap');
        :root { font-family: 'DM Sans', sans-serif; color: #17213a; background: #f5f7fb; }
        * { box-sizing: border-box; }
        body { margin: 0; min-width: 320px; background: radial-gradient(circle at 90% 0%, #e8eaff 0, transparent 30%), #f5f7fb; }
        button, input { font: inherit; }
        button { cursor: pointer; }
        button:disabled { cursor: not-allowed; opacity: .55; }
        .page { max-width: 980px; margin: 0 auto; padding: 56px 24px 80px; }
        .hero { position: relative; display: flex; align-items: center; gap: 18px; min-height: 160px; overflow: hidden; }
        .brand-mark { display: grid; place-items: center; width: 58px; height: 58px; border-radius: 18px; color: white; background: linear-gradient(135deg, #6558f5, #9b70f7); box-shadow: 0 12px 25px #7162e544; font: 700 18px 'Space Grotesk'; }
        .eyebrow { margin: 0 0 7px; color: #7568e9; font-size: 11px; font-weight: 700; letter-spacing: 1.6px; }
        h1, h2, h3 { font-family: 'Space Grotesk', sans-serif; }
        h1 { margin: 0; color: #17213a; font-size: clamp(32px, 5vw, 48px); letter-spacing: -2px; }
        h2 { margin: 0; font-size: 25px; letter-spacing: -.7px; }
        h3 { margin: 9px 0 20px; font-size: 19px; line-height: 1.45; }
        .subtitle, .muted { color: #7c8499; }
        .subtitle { margin: 9px 0 0; font-size: 16px; }
        .hero-orb { position: absolute; right: 3%; width: 170px; height: 170px; border: 1px solid #b9b4ff66; border-radius: 50%; box-shadow: 0 0 0 22px #b9b4ff12, 0 0 0 44px #b9b4ff08; }
        .steps { display: flex; gap: 8px; margin: 20px 0 28px; }
        .step { display: flex; align-items: center; gap: 8px; color: #a4aabd; font-size: 12px; font-weight: 600; }
        .step:not(:last-child)::after { content: ''; width: 42px; height: 1px; margin: 0 7px; background: #dfe3ef; }
        .step span { display: grid; place-items: center; width: 25px; height: 25px; border: 1px solid #dfe3ef; border-radius: 50%; }
        .step.active { color: #5d51d8; }.step.active span { color: white; border-color: #6759e7; background: #6759e7; }.step.complete span { color: #6759e7; border-color: #bcb7fa; background: #eeedff; }
        .card { margin-top: 20px; padding: 30px; border: 1px solid #e6e8f1; border-radius: 24px; background: #fff; box-shadow: 0 18px 45px #27345d09; }
        .section-heading, .quiz-header, .result-banner { display: flex; align-items: center; gap: 16px; }
        .number { color: #7568e9; font: 700 14px 'Space Grotesk'; }
        .dropzone { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 175px; margin: 26px 0 18px; border: 1.5px dashed #c9c7eb; border-radius: 17px; color: #68718a; background: #fafaff; text-align: center; transition: .2s; }
        .dropzone:hover { border-color: #7669ea; background: #f7f6ff; }.dropzone input { display: none; }.dropzone strong { color: #303b58; font-size: 15px; }.dropzone small { margin-top: 6px; color: #9aa1b3; }.upload-icon { display: grid; place-items: center; width: 42px; height: 42px; margin-bottom: 12px; border-radius: 13px; color: #6558e6; background: #eeedff; font-size: 25px; }
        .actions { display: flex; gap: 11px; }.primary-button, .ghost-button { min-height: 45px; padding: 0 20px; border: 0; border-radius: 11px; font-weight: 700; transition: .2s; }.primary-button { color: white; background: linear-gradient(135deg, #6658e9, #8272f2); box-shadow: 0 9px 18px #6d5fee35; }.primary-button:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 13px 22px #6d5fee4d; }.ghost-button { color: #68718a; background: #f3f4f8; }.ghost-button:hover { background: #e9eaf2; }
        .status { display: flex; align-items: center; gap: 9px; margin: 22px 0 0; padding: 12px 14px; border-radius: 10px; color: #68718a; background: #f6f8fc; font-size: 13px; }.status-dot { width: 7px; height: 7px; border-radius: 50%; background: #6bc49a; }.error { display: flex; flex-direction: column; gap: 4px; margin: 20px 0; padding: 14px 17px; border: 1px solid #ffd1d5; border-radius: 12px; color: #a83e4a; background: #fff3f4; font-size: 13px; }.error strong { font-size: 14px; }
        .generate-card .muted { margin: 12px 0 22px; }.quiz-header { justify-content: space-between; margin-bottom: 25px; }.answer-count { display: flex; align-items: baseline; gap: 3px; color: #6658e9; font: 700 25px 'Space Grotesk'; }.answer-count span { color: #c4c6d3; }.answer-count small { margin-left: 5px; color: #9aa1b3; font: 500 11px 'DM Sans'; }.question { margin-top: 18px; padding: 22px; border: 1px solid #eaebf2; border-radius: 17px; }.question-label { color: #999fb0; font-size: 10px; font-weight: 700; letter-spacing: 1.3px; }.options { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }.option { display: flex; align-items: center; gap: 11px; min-height: 52px; padding: 10px 13px; border: 1px solid #e7e9f1; border-radius: 11px; color: #5b6479; font-size: 14px; cursor: pointer; transition: .2s; }.option:hover, .option.selected { border-color: #887cf0; color: #353d59; background: #f5f3ff; }.option input { position: absolute; opacity: 0; }.option-key { display: grid; place-items: center; min-width: 27px; height: 27px; border-radius: 8px; color: #747b91; background: #f0f1f6; font-weight: 700; }.option.selected .option-key { color: white; background: #7568e9; }.submit-button { margin-top: 24px; }.result-banner { justify-content: space-between; padding: 24px; border-radius: 17px; color: white; background: linear-gradient(120deg, #6255df, #8a76ef); }.result-banner .eyebrow, .result-banner p { color: #dedaff; }.result-banner h2 { margin-bottom: 5px; }.result-banner p:last-child { margin: 0; font-size: 13px; }.score { display: flex; flex-direction: column; align-items: flex-end; }.score strong { font: 700 45px 'Space Grotesk'; }.score span { color: #e4e0ff; font-size: 12px; }.result-question.correct { border-left: 4px solid #54ba8d; }.result-question.incorrect { border-left: 4px solid #ed7884; }.question-label span { float: right; color: #54a981; }.incorrect .question-label span { color: #d85c68; }.answer-line { margin: 8px 0; color: #697286; font-size: 13px; }.explanation { margin: 17px 0 0; padding-top: 14px; border-top: 1px solid #eef0f5; color: #81899b; font-size: 13px; line-height: 1.5; }.spinner { display: inline-block; width: 14px; height: 14px; margin-right: 7px; border: 2px solid #ffffff66; border-top-color: white; border-radius: 50%; animation: spin .7s linear infinite; vertical-align: -2px; } @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 620px) { .page { padding: 30px 15px 55px; }.hero { min-height: 135px; }.hero-orb { right: -80px; }.card { padding: 21px; border-radius: 18px; }.steps { overflow-x: auto; }.step:not(:last-child)::after { width: 15px; }.step strong { display: none; }.options { grid-template-columns: 1fr; }.result-banner { align-items: flex-start; flex-direction: column; gap: 20px; }.score { align-items: flex-start; }.score strong { font-size: 38px; } }
    `
};
