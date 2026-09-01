import json
from typing import Any, Dict


class CyberSarahControlCenter:

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


if __name__ == "__main__":
    app = CyberSarahControlCenter()

    request_payload = app.generate_api_request(
        model_name="llama3",
        prompt="Analyze system logs for security vulnerabilities.",
        temperature=0.5,
        seed=42,
    )

    print("--- Generated JSON Payload ---")
    print(json.dumps(request_payload, indent=2))
