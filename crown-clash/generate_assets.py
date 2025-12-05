
import os
import base64

assets = {
    'knight': 'unit_knight.png',
    'archer': 'unit_archer.png',
    'giant': 'unit_giant.png',
    'tower_player': 'tower_blue.png',
    'tower_enemy': 'tower_red.png',
    'arena': 'arena_bg.png'
}

js_content = "window.GAME_ASSETS = {\n"

for key, filename in assets.items():
    if os.path.exists(filename):
        with open(filename, "rb") as image_file:
            encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
            js_content += f"    '{key}': 'data:image/png;base64,{encoded_string}',\n"
    else:
        print(f"Warning: {filename} not found")

js_content += "};\n"

with open("assets.js", "w") as f:
    f.write(js_content)

print("assets.js created")
