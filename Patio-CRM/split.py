import re

with open(r'C:\Users\thiag\.gemini\antigravity-ide\scratch\patio-crm-oficina_2.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Extract CSS
style_match = re.search(r'<style>(.*?)</style>', content, re.DOTALL)
css_content = style_match.group(1).strip() if style_match else ''

# Extract JS
script_match = re.search(r'<script>(.*?)</script>', content, re.DOTALL)
js_content = script_match.group(1).strip() if script_match else ''

# Clean up HTML
html_content = re.sub(r'<style>.*?</style>', '<link rel="stylesheet" href="style.css">', content, flags=re.DOTALL)
html_content = re.sub(r'<script>.*?</script>', '<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>\n<script src="app.js"></script>', html_content, flags=re.DOTALL)

with open(r'C:\Users\thiag\.gemini\antigravity-ide\scratch\Patio-CRM\style.css', 'w', encoding='utf-8') as f:
    f.write(css_content)

with open(r'C:\Users\thiag\.gemini\antigravity-ide\scratch\Patio-CRM\app.js', 'w', encoding='utf-8') as f:
    f.write(js_content)

with open(r'C:\Users\thiag\.gemini\antigravity-ide\scratch\Patio-CRM\index.html', 'w', encoding='utf-8') as f:
    f.write(html_content)

print("Split successful")
