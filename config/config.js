// System Configuration & LLM Routing
window.CONFIG = {

    // ── API Keys ──────────────────────────────────────────────────────────────
    KEYS: {
        openai:  "",
        glm5:    "",
        qwen:    ""
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
            model: ""
        },
        qwen: {
            // Alibaba DashScope — replace YOUR_QWEN_API_KEY above to activate
            url:   "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
            model: "qwen-max"
        }
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
