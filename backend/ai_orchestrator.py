"""Optional OpenAI-backed analysis for OpsPilot AI.

The enterprise evidence still comes only from local mock data. This module is
the single place where the backend may call OpenAI to reason over that evidence.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


DEFAULT_MODEL = "gpt-4.1-mini"
PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"
INCIDENT_ANALYSIS_PROMPT = PROMPTS_DIR / "incident_analysis.md"


def get_ai_status() -> dict[str, Any]:
    """Return whether OpenAI-backed reasoning is configured."""

    return {
        "enabled": bool(os.getenv("OPENAI_API_KEY")),
        "provider": "openai",
        "model": os.getenv("OPENAI_MODEL", DEFAULT_MODEL),
        "reasoning_visibility": "summary_only",
    }


def _disabled_response(reason: str) -> dict[str, Any]:
    status = get_ai_status()
    return {
        "enabled": False,
        "provider": status["provider"],
        "model": status["model"],
        "status": "disabled",
        "reasoning_summary": reason,
        "source_trace": [],
        "activity": [
            "OpenAI API key/package check did not pass.",
            "Skipped OpenAI Responses API call.",
            "Returned local deterministic analysis fallback.",
        ],
    }


def _load_prompt_template(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _build_prompt(context: dict[str, Any]) -> str:
    context_json = json.dumps(
        context,
        indent=2,
        default=str,
    )
    return _load_prompt_template(INCIDENT_ANALYSIS_PROMPT).replace(
        "{normalized_incident_context}",
        context_json,
    )


def _parse_json_object(text: str) -> dict[str, Any]:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise
        return json.loads(text[start : end + 1])


def analyze_incident(context: dict[str, Any]) -> dict[str, Any]:
    """Ask OpenAI to analyze collected mock-enterprise evidence.

    Returns a metadata-rich dict. It never raises to the caller; failures become
    an analysis status so the demo can keep running with deterministic fallback.
    """

    if not os.getenv("OPENAI_API_KEY"):
        return _disabled_response("OPENAI_API_KEY is not set; using local deterministic analysis.")

    try:
        from openai import OpenAI
    except ImportError:
        return _disabled_response("The openai Python package is not installed; using local deterministic analysis.")

    model = os.getenv("OPENAI_MODEL", DEFAULT_MODEL)

    try:
        client = OpenAI()
        prompt = _build_prompt(context)
        response = client.responses.create(
            model=model,
            instructions=(
                "You are OpsPilot AI, a read-only IT operations assistant for a banking environment. "
                "Analyze synthetic incident evidence from mock enterprise systems. "
                "Return valid JSON only. Do not include markdown."
            ),
            input=prompt,
            max_output_tokens=1400,
            temperature=0.2,
        )
        parsed = _parse_json_object(response.output_text)
        parsed["enabled"] = True
        parsed["provider"] = "openai"
        parsed["model"] = model
        parsed["status"] = "completed"
        parsed["prompt_file"] = str(INCIDENT_ANALYSIS_PROMPT)
        parsed["activity"] = [
            "Loaded incident evidence from local mock-data via backend connectors.",
            f"Loaded OpenAI prompt template from {INCIDENT_ANALYSIS_PROMPT.name}.",
            f"Sent normalized incident context to OpenAI Responses API using {model}.",
            "Received structured JSON analysis from OpenAI.",
            "Mapped AI summary, evidence, recommendations, Teams draft, and source trace into the triage response.",
        ]
        return parsed
    except Exception as exc:
        status = get_ai_status()
        return {
            "enabled": True,
            "provider": status["provider"],
            "model": model,
            "status": "error",
            "error": str(exc),
            "reasoning_summary": "OpenAI analysis failed; using local deterministic analysis.",
            "source_trace": [],
            "prompt_file": str(INCIDENT_ANALYSIS_PROMPT),
            "activity": [
                "Loaded incident evidence from local mock-data via backend connectors.",
                f"Loaded OpenAI prompt template from {INCIDENT_ANALYSIS_PROMPT.name}.",
                f"Attempted OpenAI Responses API call using {model}.",
                "OpenAI call failed; returned local deterministic analysis fallback.",
            ],
        }
