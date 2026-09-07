from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from PIL import Image
from pathlib import Path

images = [
    Path(r"C:\Users\Admin\AppData\Local\Temp\codex-clipboard-e35bd500-33ea-4fc6-b07b-bd87e6618690.png"),
    Path(r"C:\Users\Admin\AppData\Local\Temp\codex-clipboard-c59bbfd6-3718-41a9-94b7-5e6fe9340a4e.png"),
    Path(r"C:\Users\Admin\AppData\Local\Temp\codex-clipboard-978a3ca0-546f-4006-a623-3a8e508addc4.png"),
]
output = Path("output/pdf/file_transfer_screenshots.pdf")
output.parent.mkdir(parents=True, exist_ok=True)

page_width, page_height = A4
margin = 30
gap = 20
available_height = page_height - 2 * margin - gap
slot_height = available_height / 2
available_width = page_width - 2 * margin

pdf = canvas.Canvas(str(output), pagesize=A4)
pdf.setTitle("File Transfer Screenshots")

for index, path in enumerate(images):
    if index and index % 2 == 0:
        pdf.showPage()
    position = index % 2
    with Image.open(path) as image:
        width, height = image.size
    scale = min(available_width / width, slot_height / height)
    draw_width = width * scale
    draw_height = height * scale
    x = (page_width - draw_width) / 2
    y = page_height - margin - position * (slot_height + gap) - draw_height
    pdf.drawImage(ImageReader(str(path)), x, y, draw_width, draw_height)

pdf.save()
print(output.resolve())
