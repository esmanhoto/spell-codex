import json

INPUT = "1st.json"
OUTPUT = "1st_effects_report.txt"

def main():
    with open(INPUT, encoding="utf-8") as f:
        cards = json.load(f)

    with_effects = []
    without_effects = []

    for card in cards:
        name = card.get("name", "")
        desc = card.get("description", "")
        effects = card.get("effects", [])
        if desc:
            if effects:
                with_effects.append((name, desc, effects))
            else:
                without_effects.append((name, desc))

    with open(OUTPUT, "w", encoding="utf-8") as out:
        out.write("CARDS WITH EFFECTS\n===================\n")
        for name, desc, effects in with_effects:
            out.write(f"{name}: {desc}\nEffects:\n{json.dumps(effects, indent=2, ensure_ascii=False)}\n\n")
        out.write("\nCARDS WITHOUT EFFECTS\n======================\n")
        for name, desc in without_effects:
            out.write(f"{name}: {desc}\n\n")

if __name__ == "__main__":
    main()
