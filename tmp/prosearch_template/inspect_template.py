from pathlib import Path

from docx import Document


path = Path(r"C:\hub-git\tmp\prosearch_template\프로써치_양식_작업사본.docx")
doc = Document(path)

for index, paragraph in enumerate(doc.paragraphs):
    text = paragraph.text.replace("\t", "→").replace("\n", "↵")
    if not text.strip():
        continue

    runs = []
    for run in paragraph.runs:
        if not run.text:
            continue
        size = run.font.size.pt if run.font.size else None
        runs.append(
            f"{run.text!r}[b={run.bold},sz={size},name={run.font.name}]"
        )

    page_break = bool(paragraph._p.xpath('.//w:br[@w:type="page"]'))
    section_break = bool(paragraph._p.xpath("./w:pPr/w:sectPr"))
    print(
        f"{index:03d} style={paragraph.style.name!r} align={paragraph.alignment} "
        f"pagebr={page_break} sect={section_break} text={text!r}"
    )
    print("   RUNS " + " | ".join(runs))
