// System Configuration & LLM Routing
window.CONFIG = {

    // ── API Keys ──────────────────────────────────────────────────────────────
    KEYS: {
        openai:  "YOUR_OPENAI_API_KEY",
        glm5:    "YOUR_GLM_API_KEY",
        qwen:    "YOUR_QWEN_API_KEY"
    },

    // ── Endpoints (OpenAI-compatible format) ──────────────────────────────────
    ENDPOINTS: {
        openai: {
            url:   "https://api.openai.com/v1/chat/completions",
            model: "gpt-4o-mini"
        },
        glm5: {
            // ZhipuAI / BigModel — free tier fast model
            // If "Unknown Model" error: try glm-4-flash-250414, glm-4-air, or glm-4-plus
            url:   "https://open.bigmodel.cn/api/paas/v4/chat/completions",
            model: "glm-4-flash"
        },
        qwen: {
            // Alibaba DashScope — replace YOUR_QWEN_API_KEY above to activate
            url:   "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
            model: "qwen-max"
        }
    },

    // ── Runtime behavior / safety controls ───────────────────────────────────
    RUNTIME: {
        // If true, browser sends requests to your backend broker instead of providers directly.
        // Broker should accept OpenAI-compatible payload and attach provider credentials server-side.
        use_backend_broker: false,
        backend_broker_url: "http://localhost:3000/api/ai/chat",
        request_timeout_ms: 60000,
        request_max_retries: 2,
        request_backoff_base_ms: 1200,
        max_pdf_size_mb: 25,
        max_pdf_pages: 120,
        redact_pii_before_llm: true
    },

    // ── Role sentiment analysis ───────────────────────────────────────────────
    // true  = sentiment flags allowed for this role
    // false = sentiment always stripped (support/resolver side)
    role_sentiment_config: {
        "Affected Business User":    true,
        "Reporting Person":          true,
        "Business Team":             true,
        "Process Owner":             true,
        "Service Delivery Manager":  true,
        "Escalation Owner":          true,
        "Leadership / Tower Lead":   true,
        "Major Incident Manager":    false,
        "Problem Manager":           false,
        "Service Desk Agent":        false,
        "Support Team":              false
    }
};
