import json
from typing import Any, Dict

try:
    from ollama import Client
except ImportError:
    from ollamafreeapi import client as Client


class CyberSarahControlCenter:

    def __init__(self, base_url: str = "http://localhost:11434"):
        if callable(Client):
            try:
                self.client = Client(host=base_url)
            except TypeError:
                self.client = Client
        else:
            self.client = Client

    def generate_api_request(
        self, model_name: str, prompt: str, **kwargs
    ) -> Dict[str, Any]:
        """Generate the JSON payload for an API request."""
        options: Dict[str, Any] = {
            "temperature": kwargs.get("temperature", 0.7),
            "top_p": kwargs.get("top_p", 0.9),
            "stop": kwargs.get("stop", []),
            "num_predict": kwargs.get("num_predict", 128),
        }

        optional_params = ["repeat_penalty", "seed", "tfs_z", "mirostat"]
        for param in optional_params:
            if param in kwargs and kwargs[param] is not None:
                options[param] = kwargs[param]

        for key, value in kwargs.items():
            if key not in options and value is not None:
                options[key] = value

        return {"model": model_name, "prompt": prompt, "options": options}

    def send_request(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Send the generated payload using the client."""
        if hasattr(self.client, "generate"):
            return self.client.generate(
                model=payload["model"],
                prompt=payload["prompt"],
                options=payload.get("options", {}),
            )
        return self.client(
            model=payload["model"],
            prompt=payload["prompt"],
            options=payload.get("options", {}),
        )

    def extract_response_text(self, raw_response: Any) -> str:
        """Extract only the output text from an Ollama response object or dict."""
        if isinstance(raw_response, dict):
            return raw_response.get("response", "")
        if hasattr(raw_response, "response"):
            return getattr(raw_response, "response", "")
        return str(raw_response)


if __name__ == "__main__":
    app = CyberSarahControlCenter()

    payload = app.generate_api_request(
        model_name="tinyllama",
        prompt="Analyze system logs for security vulnerabilities.",
        temperature=0.5,
        seed=42,
    )

    print("--- Sending API Request ---")
    print(json.dumps(payload, indent=2))

    try:
        raw_response = app.send_request(payload)
        clean_text = app.extract_response_text(raw_response)

        print("\n--- Clean Response Text ---")
        print(clean_text)
    except Exception as e:
        print(f"\nRequest failed: {e}")
