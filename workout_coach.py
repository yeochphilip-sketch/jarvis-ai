#!/usr/bin/env python3
"""Generate today's workout based on Garmin bio-data."""

import json
import os
from datetime import datetime
import urllib.request

MODEL = "qwen2.5-coder:3b"
OLLAMA_URL = "http://127.0.0.1:11434/api/generate"

def load_today_data():
    today = datetime.now().strftime("%Y-%m-%d")
    path = f"data/health/{today}.json"
    
    if not os.path.exists(path):
        print("No health data found. Run garmin_fetcher.py first.")
        exit(1)
    
    with open(path) as f:
        return json.load(f)

def build_prompt(data):
    sleep = data.get("sleep", {})
    bb = data.get("body_battery", {})
    stress = data.get("stress", {})
    hr = data.get("resting_hr", {})
    training = data.get("training_status", {})
    
    # Extract nested values safely
    sleep_dto = sleep.get("dailySleepDTO", {}) if isinstance(sleep, dict) else {}
    sleep_score = sleep_dto.get("sleepScore", "N/A") if isinstance(sleep_dto, dict) else "N/A"
    sleep_duration = sleep_dto.get("sleepTimeInBed", "N/A") if isinstance(sleep_dto, dict) else "N/A"
    
    return f"""You are an elite running coach and sports scientist.

ATHLETE BIOMETRICS (today):
- Sleep Score: {sleep_score}
- Sleep Duration: {sleep_duration} minutes in bed
- Body Battery: {bb}
- Resting Heart Rate: {hr}
- Stress Level: {stress}
- Training Status: {training}

RULES:
- Sleep score < 70 or body battery < 25: REST or easy 30min jog
- Resting HR 5+ bpm above baseline: recovery day
- High stress: yoga or easy run
- Otherwise: follow progression (easy, tempo, interval, long run)

Return ONLY a JSON object with:
{{
  "workout_type": "rest|easy|tempo|interval|long_run",
  "duration_minutes": number,
  "description": "specific instructions",
  "intensity": "low|moderate|high",
  "reasoning": "why this workout based on biomarkers"
}}"""

def ask_ollama(prompt):
    payload = json.dumps({
        "model": MODEL,
        "prompt": prompt,
        "stream": False
    }).encode()
    
    req = urllib.request.Request(
        OLLAMA_URL,
        data=payload,
        headers={"Content-Type": "application/json"}
    )
    
    with urllib.request.urlopen(req) as response:
        result = json.loads(response.read())
        return result["response"]

def main():
    data = load_today_data()
    prompt = build_prompt(data)
    print("Asking Jarvis for workout plan...")
    workout = ask_ollama(prompt)
    
    today = datetime.now().strftime("%Y-%m-%d")
    os.makedirs("data/workouts", exist_ok=True)
    
    with open(f"data/workouts/{today}.json", "w") as f:
        f.write(workout)
    
    print("\n=== TODAY'S WORKOUT ===")
    print(workout)

if __name__ == "__main__":
    main()
