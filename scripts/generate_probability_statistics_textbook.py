from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from worksheet_solutions import append_worked_worksheets


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "probability_statistics_simplified_textbook.pdf"

NAVY = colors.HexColor("#12304A")
TEAL = colors.HexColor("#117B83")
PALE_TEAL = colors.HexColor("#E8F5F3")
PALE_BLUE = colors.HexColor("#EEF5FA")
PALE_GOLD = colors.HexColor("#FFF5E5")
INK = colors.HexColor("#17212B")
MUTED = colors.HexColor("#52616B")
GRID = colors.HexColor("#C8D5DD")


def register_fonts():
    pdfmetrics.registerFont(TTFont("Cambria", "C:/Windows/Fonts/cambria.ttc"))
    pdfmetrics.registerFont(TTFont("Cambria-Bold", "C:/Windows/Fonts/cambriab.ttf"))
    pdfmetrics.registerFont(TTFont("Cambria-Italic", "C:/Windows/Fonts/cambriai.ttf"))
    pdfmetrics.registerFont(TTFont("SegoeUISymbol", "C:/Windows/Fonts/seguisym.ttf"))


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(GRID)
    canvas.line(doc.leftMargin, 13 * mm, A4[0] - doc.rightMargin, 13 * mm)
    canvas.setFont("Cambria", 7.4)
    canvas.setFillColor(MUTED)
    canvas.drawString(doc.leftMargin, 8.5 * mm, "Probability and Statistics - Simplified Textbook")
    canvas.drawRightString(A4[0] - doc.rightMargin, 8.5 * mm, f"Page {doc.page}")
    canvas.restoreState()


def paragraph(text, style):
    return Paragraph(text, style)


def chapter(story, number, title, subtitle, styles, break_before=True):
    if break_before:
        story.append(PageBreak())
    banner = Table(
        [[paragraph(f"<font size='9'>CHAPTER {number}</font><br/><b>{title}</b><br/><font size='9' color='#DCEFF1'>{subtitle}</font>", styles["chapter_banner"])]],
        colWidths=[174 * mm],
    )
    banner.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), NAVY),
        ("BOX", (0, 0), (-1, -1), 0.6, NAVY),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.extend([banner, Spacer(1, 5 * mm)])


def section(story, title, styles):
    story.extend([Spacer(1, 3.5 * mm), paragraph(title, styles["section"]), Spacer(1, 1.4 * mm)])


def text(story, value, styles):
    story.extend([paragraph(value, styles["body"]), Spacer(1, 1.8 * mm)])


def note(story, value, styles):
    box = Table([[paragraph(value, styles["note"])]], colWidths=[174 * mm])
    box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PALE_GOLD),
        ("BOX", (0, 0), (-1, -1), 0.45, colors.HexColor("#E4BF77")),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.extend([box, Spacer(1, 2.4 * mm)])


def equation(story, value, styles):
    box = Table([[paragraph(value, styles["math"])]], colWidths=[174 * mm])
    box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PALE_BLUE),
        ("BOX", (0, 0), (-1, -1), 0.45, GRID),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.extend([box, Spacer(1, 2.3 * mm)])


def fraction(story, left, numerator, denominator, right, styles):
    font_name = "Cambria"
    font_size = 12
    frac_width = max(
        pdfmetrics.stringWidth(numerator, font_name, font_size),
        pdfmetrics.stringWidth(denominator, font_name, font_size),
    ) + 14
    left_width = max(3, pdfmetrics.stringWidth(left, font_name, font_size) + 6)
    right_width = max(3, pdfmetrics.stringWidth(right, font_name, font_size) + 6)
    frac = Table(
        [[paragraph(numerator, styles["math_fraction"])], [paragraph(denominator, styles["math_fraction"])]],
        colWidths=[frac_width],
    )
    frac.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (0, 0), 0.8, INK),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
    ]))
    content = Table(
        [[paragraph(left, styles["math_inline"]), frac, paragraph(right, styles["math_inline"])]],
        colWidths=[left_width, frac_width, right_width],
        hAlign="CENTER",
    )
    content.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 1),
        ("RIGHTPADDING", (0, 0), (-1, -1), 1),
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
    ]))
    box = Table([[content]], colWidths=[174 * mm])
    box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PALE_BLUE),
        ("BOX", (0, 0), (-1, -1), 0.45, GRID),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.extend([box, Spacer(1, 2.3 * mm)])


def symbol_table(story, styles):
    rows = [
        ("xᵢ", "Observation or class midpoint"),
        ("fᵢ", "Frequency of xᵢ"),
        ("N = Σfᵢ", "Total number of observations"),
        ("CF", "Cumulative frequency"),
        ("L", "Lower limit of the required class"),
        ("h", "Class width"),
        ("A", "Assumed mean"),
    ]
    data = [[paragraph("<b>Symbol</b>", styles["table_head"]), paragraph("<b>Meaning</b>", styles["table_head"])]]
    data += [[paragraph(a, styles["math_small"]), paragraph(b, styles["table_cell"])] for a, b in rows]
    table = Table(data, colWidths=[38 * mm, 136 * mm], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), TEAL),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.4, GRID),
        ("BACKGROUND", (0, 1), (-1, -1), PALE_TEAL),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(table)


def build():
    register_fonts()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    base = getSampleStyleSheet()
    styles = {
        "title": ParagraphStyle("tx_title", parent=base["Title"], fontName="Cambria-Bold", fontSize=25, leading=29, textColor=NAVY, alignment=TA_CENTER, spaceAfter=5),
        "subtitle": ParagraphStyle("tx_subtitle", parent=base["Normal"], fontName="Cambria", fontSize=10.5, leading=14, textColor=MUTED, alignment=TA_CENTER),
        "chapter_banner": ParagraphStyle("tx_chapter_banner", parent=base["Normal"], fontName="Cambria", fontSize=17, leading=23, textColor=colors.white, alignment=TA_LEFT),
        "section": ParagraphStyle("tx_section", parent=base["Heading2"], fontName="Cambria-Bold", fontSize=13.5, leading=17, textColor=TEAL, keepWithNext=True),
        "body": ParagraphStyle("tx_body", parent=base["BodyText"], fontName="Cambria", fontSize=9.7, leading=14.2, textColor=INK, alignment=TA_JUSTIFY),
        "note": ParagraphStyle("tx_note", parent=base["BodyText"], fontName="Cambria", fontSize=9.2, leading=13, textColor=INK),
        "math": ParagraphStyle("tx_math", parent=base["Normal"], fontName="Cambria", fontSize=13, leading=17, textColor=INK, alignment=TA_CENTER),
        "math_inline": ParagraphStyle("tx_math_inline", parent=base["Normal"], fontName="Cambria", fontSize=12, leading=15, textColor=INK, alignment=TA_CENTER),
        "math_fraction": ParagraphStyle("tx_math_fraction", parent=base["Normal"], fontName="Cambria", fontSize=11.5, leading=13, textColor=INK, alignment=TA_CENTER),
        "math_small": ParagraphStyle("tx_math_small", parent=base["Normal"], fontName="Cambria", fontSize=10.5, leading=13, textColor=INK, alignment=TA_CENTER),
        "table_head": ParagraphStyle("tx_table_head", parent=base["Normal"], fontName="Cambria-Bold", fontSize=9, leading=11, textColor=colors.white),
        "table_cell": ParagraphStyle("tx_table_cell", parent=base["Normal"], fontName="Cambria", fontSize=8.8, leading=11.5, textColor=INK),
    }

    doc = SimpleDocTemplate(
        str(OUTPUT), pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=16 * mm, bottomMargin=19 * mm,
        title="Probability and Statistics: Simplified Textbook",
        author="Codex",
    )
    story = [
        Spacer(1, 23 * mm),
        paragraph("PROBABILITY AND STATISTICS", styles["title"]),
        paragraph("A Simplified Textbook with Exact Mathematical Notation", styles["subtitle"]),
        Spacer(1, 13 * mm),
    ]
    cover = Table([[paragraph(
        "Central tendency • positional measures • dispersion • skewness • moments • kurtosis • counting • conditional probability • total probability • Bayes' theorem",
        styles["note"],
    )]], colWidths=[150 * mm])
    cover.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PALE_TEAL),
        ("BOX", (0, 0), (-1, -1), 0.6, TEAL),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
    ]))
    story.extend([cover, Spacer(1, 20 * mm)])
    text(story, "This book places the mathematical formula immediately beside the theory it represents. The notation follows the supplied lecture notes and worksheets, while the explanations are shortened for test and examination revision.", styles)

    chapter(story, 1, "Basic Statistical Notation", "Symbols used throughout the descriptive-statistics chapters", styles)
    text(story, "Suppose a dataset contains observations x₁, x₂, x₃, …, xₙ. In a frequency distribution, each value xᵢ occurs fᵢ times.", styles)
    symbol_table(story, styles)
    section(story, "Class midpoint", styles)
    text(story, "For continuous grouped data, every class is represented by its midpoint.", styles)
    fraction(story, "xᵢ =", "Lower Limit + Upper Limit", "2", "", styles)
    note(story, "Continuous classes should have matching boundaries, such as 10-20, 20-30, 30-40, so that there are no gaps or overlaps.", styles)

    chapter(story, 2, "Measures of Central Tendency", "Mean, weighted mean, median, and mode", styles)
    section(story, "Arithmetic mean", styles)
    text(story, "The arithmetic mean is obtained by adding all observations and dividing by their number. It is the balancing point of the distribution and is most representative when the data are reasonably symmetric and contain no serious outliers.", styles)
    fraction(story, "x̄ =", "Σᵢ₌₁ᴺ xᵢ", "N", "", styles)
    equation(story, "Σ(xᵢ − x̄) = 0", styles)
    text(story, "For discrete frequency data or continuous grouped data, every value is multiplied by its frequency.", styles)
    fraction(story, "x̄ =", "Σfᵢxᵢ", "Σfᵢ", "", styles)

    section(story, "Weighted mean", styles)
    text(story, "A weighted mean is used when observations have unequal importance. The weights may represent traffic, credit hours, quantities, or relative importance.", styles)
    fraction(story, "x̄w =", "Σᵢ₌₁ⁿ wᵢxᵢ", "Σᵢ₌₁ⁿ wᵢ", "", styles)

    section(story, "Assumed-mean method", styles)
    text(story, "A convenient central value A is chosen to reduce the size of the arithmetic. The deviations are measured from A.", styles)
    equation(story, "dᵢ = xᵢ − A", styles)
    fraction(story, "x̄ = A +", "Σdᵢ", "N", "", styles)
    fraction(story, "x̄ = A +", "Σfᵢdᵢ", "Σfᵢ", "", styles)

    section(story, "Step-deviation method", styles)
    text(story, "When deviations are multiples of a common factor or class width h, the deviations are divided by h.", styles)
    fraction(story, "uᵢ =", "xᵢ − A", "h", "", styles)
    fraction(story, "x̄ = A +", "Σuᵢ", "N", "× h", styles)
    fraction(story, "x̄ = A +", "Σfᵢuᵢ", "Σfᵢ", "× h", styles)

    section(story, "Correcting an incorrect mean", styles)
    text(story, "The reported mean is first converted back to a total. The incorrect observations are removed and the correct observations are inserted.", styles)
    equation(story, "Σxwrong = N x̄wrong", styles)
    equation(story, "Σxcorrect = N x̄wrong − Σ(Wrong Values) + Σ(Correct Values)", styles)
    fraction(story, "x̄correct = x̄wrong +", "Σ(Correct Value − Wrong Value)", "N", "", styles)

    section(story, "Median", styles)
    text(story, "The median is the middle value after the observations have been arranged in ascending order. It is resistant to extreme values and is preferred for skewed distributions.", styles)
    fraction(story, "Median Position =", "N + 1", "2", "", styles)
    text(story, "For even N, the two central observations are averaged.", styles)
    fraction(story, "Median =", "x₍N/2₎ + x₍N/2+1₎", "2", "", styles)
    text(story, "For discrete frequency data, calculate cumulative frequencies and select the value whose cumulative frequency first reaches or exceeds (N+1)/2.", styles)
    text(story, "For continuous grouped data, locate the class whose cumulative frequency first reaches N/2 and interpolate within that class.", styles)
    fraction(story, "Median = L +", "N/2 − CF<", "fₘ", "× h", styles)

    section(story, "Mode", styles)
    text(story, "The mode is the value occurring most frequently. For continuous grouped data, the class with the largest frequency is the modal class.", styles)
    fraction(story, "Mode = L +", "f₁ − f₀", "2f₁ − f₀ − f₂", "× h", styles)
    text(story, "Here f₁ is the modal-class frequency, f₀ is the preceding frequency, and f₂ is the following frequency.", styles)

    section(story, "Mean, median, mode, and skewness", styles)
    equation(story, "Mean = Median = Mode    (Symmetric)", styles)
    equation(story, "Mean > Median > Mode    (Positive / Right Skew)", styles)
    equation(story, "Mean < Median < Mode    (Negative / Left Skew)", styles)

    chapter(story, 3, "Positional Measures", "Quartiles, deciles, percentiles, and the middle fifty percent", styles)
    section(story, "Quartiles", styles)
    text(story, "Quartiles divide an ordered dataset into four equal parts. Q₁ = P₂₅, Q₂ = P₅₀ = Median, and Q₃ = P₇₅.", styles)
    fraction(story, "Qₖ Position =", "k(N + 1)", "4", "", styles)
    fraction(story, "Qₖ = L +", "kN/4 − CF<", "fQ", "× h", styles)

    section(story, "Deciles", styles)
    text(story, "Deciles divide an ordered dataset into ten equal parts. D₁ = P₁₀, D₅ = P₅₀, and D₉ = P₉₀.", styles)
    fraction(story, "Dₖ Position =", "k(N + 1)", "10", "", styles)
    fraction(story, "Dₖ = L +", "kN/10 − CF<", "fD", "× h", styles)

    section(story, "Percentiles", styles)
    text(story, "Percentiles divide an ordered dataset into one hundred equal parts.", styles)
    fraction(story, "Pₖ Position =", "k(N + 1)", "100", "", styles)
    fraction(story, "Pₖ = L +", "kN/100 − CF<", "fP", "× h", styles)
    equation(story, "Bottom x% = Pₓ", styles)
    equation(story, "Top x% = P₍₁₀₀₋ₓ₎", styles)
    equation(story, "Top 10% = P₉₀      Top 5% = P₉₅      Top 1% = P₉₉", styles)

    section(story, "Interquartile range and quartile deviation", styles)
    text(story, "The interquartile range covers the middle fifty percent of the observations and is less affected by extreme values.", styles)
    equation(story, "IQR = Q₃ − Q₁", styles)
    fraction(story, "QD =", "Q₃ − Q₁", "2", "", styles)
    fraction(story, "Coefficient of QD =", "Q₃ − Q₁", "Q₃ + Q₁", "", styles)

    chapter(story, 4, "Measures of Dispersion", "Range, mean deviation, variance, standard deviation, and coefficient of variation", styles)
    text(story, "A central value describes where a distribution is located. Dispersion describes how far the observations spread around that central value.", styles)
    section(story, "Range", styles)
    equation(story, "R = Xₘₐₓ − Xₘᵢₙ", styles)
    fraction(story, "Coefficient of Range =", "Xₘₐₓ − Xₘᵢₙ", "Xₘₐₓ + Xₘᵢₙ", "", styles)
    text(story, "Range is simple but depends only on the two extreme observations and is highly sensitive to outliers.", styles)

    section(story, "Mean deviation", styles)
    text(story, "Mean deviation measures the average absolute distance from the mean. Absolute values prevent positive and negative deviations from cancelling.", styles)
    fraction(story, "MDx̄ =", "Σ|xᵢ − x̄|", "N", "", styles)
    fraction(story, "MDx̄ =", "Σfᵢ|xᵢ − x̄|", "Σfᵢ", "", styles)
    fraction(story, "Coefficient of MD =", "MDx̄", "x̄", "", styles)

    section(story, "Variance", styles)
    text(story, "Variance measures the average squared distance from the mean. Squaring gives greater importance to large deviations.", styles)
    fraction(story, "σ² =", "Σᵢ₌₁ᴺ(xᵢ − μ)²", "N", "", styles)
    fraction(story, "s² =", "Σᵢ₌₁ⁿ(xᵢ − x̄)²", "n − 1", "", styles)
    fraction(story, "σ² =", "Σfᵢ(xᵢ − x̄)²", "Σfᵢ", "", styles)
    text(story, "The computational forms are useful when sums of squares are supplied.", styles)
    fraction(story, "σ² =", "Σxᵢ²", "N", "− x̄²", styles)
    fraction(story, "σ² =", "Σfᵢxᵢ²", "N", "− x̄²", styles)

    section(story, "Standard deviation", styles)
    equation(story, "σ = √σ²", styles)
    equation(story, "s = √s²", styles)
    text(story, "Variance has squared units. Standard deviation has the same units as the original observations. A smaller standard deviation indicates greater absolute consistency.", styles)

    section(story, "Coefficient of variation", styles)
    fraction(story, "CV =", "σ", "x̄", "× 100%", styles)
    equation(story, "CVₐ < CVᵦ  ⟹  A is more consistent", styles)
    equation(story, "CVₐ > CVᵦ  ⟹  A has greater relative variation", styles)
    text(story, "Coefficient of variation should be used when comparing datasets having different means, magnitudes, or units.", styles)

    chapter(story, 5, "Shape of a Distribution", "Skewness, central moments, and kurtosis", styles)
    section(story, "Karl Pearson's coefficient of skewness", styles)
    fraction(story, "Sk =", "x̄ − Mode", "σ", "", styles)
    text(story, "When the mode is absent or unreliable, the median form is used.", styles)
    fraction(story, "Sk =", "3(x̄ − Median)", "σ", "", styles)
    equation(story, "Sk = 0  ⟹  Symmetric", styles)
    equation(story, "Sk > 0  ⟹  Positively Skewed", styles)
    equation(story, "Sk < 0  ⟹  Negatively Skewed", styles)

    section(story, "Bowley's coefficient of skewness", styles)
    text(story, "Bowley's coefficient uses quartiles and is therefore less affected by extreme observations.", styles)
    fraction(story, "SkB =", "Q₃ + Q₁ − 2Q₂", "Q₃ − Q₁", "", styles)

    section(story, "Central moments", styles)
    text(story, "Central moments describe the spread and shape of a distribution about its mean.", styles)
    fraction(story, "μᵣ =", "Σ(xᵢ − x̄)ʳ", "N", "", styles)
    fraction(story, "μᵣ =", "Σfᵢ(xᵢ − x̄)ʳ", "Σfᵢ", "", styles)
    fraction(story, "μ₁ =", "Σ(xᵢ − x̄)", "N", "= 0", styles)
    fraction(story, "μ₂ =", "Σ(xᵢ − x̄)²", "N", "= σ²", styles)
    fraction(story, "μ₃ =", "Σ(xᵢ − x̄)³", "N", "", styles)
    fraction(story, "μ₄ =", "Σ(xᵢ − x̄)⁴", "N", "", styles)
    equation(story, "σ = √μ₂", styles)

    section(story, "Skewness using moments", styles)
    fraction(story, "γ₁ =", "μ₃", "μ₂³ᐟ²", "", styles)
    fraction(story, "β₁ =", "μ₃²", "μ₂³", "", styles)
    text(story, "The sign of γ₁ or μ₃ gives the direction of skewness. Since μ₃ is squared in β₁, β₁ is non-negative.", styles)

    section(story, "Kurtosis", styles)
    text(story, "Kurtosis describes the relative thickness of the tails of a distribution.", styles)
    fraction(story, "β₂ =", "μ₄", "μ₂²", "", styles)
    equation(story, "β₂ = 3  ⟹  Mesokurtic", styles)
    equation(story, "β₂ > 3  ⟹  Leptokurtic", styles)
    equation(story, "β₂ < 3  ⟹  Platykurtic", styles)

    chapter(story, 6, "Foundations of Probability", "Random experiments, sample spaces, events, and probability rules", styles)
    section(story, "Random experiment and sample space", styles)
    text(story, "A random experiment has well-defined possible outcomes, but the exact outcome cannot be predicted in advance. The set of all possible outcomes is the sample space S. An event A is a subset of S.", styles)
    equation(story, "S = {ω₁, ω₂, …, ωₙ}", styles)
    equation(story, "A ⊆ S", styles)

    section(story, "Operations on events", styles)
    text(story, "A ∪ B represents A or B or both. A ∩ B represents A and B. A′ or Aᶜ represents not A.", styles)
    equation(story, "A ∪ B        A ∩ B        A′ = Aᶜ", styles)
    equation(story, "A ∩ B = ∅    (Mutually Exclusive)", styles)
    equation(story, "A ∪ B = S    (Collectively Exhaustive)", styles)
    equation(story, "A ∩ A′ = ∅        A ∪ A′ = S", styles)

    section(story, "Axioms of probability", styles)
    equation(story, "P(A) ≥ 0", styles)
    equation(story, "P(S) = 1", styles)
    equation(story, "0 ≤ P(A) ≤ 1", styles)
    equation(story, "A ∩ B = ∅  ⟹  P(A ∪ B) = P(A) + P(B)", styles)

    section(story, "Classical probability", styles)
    text(story, "When every possible outcome is equally likely, probability is the ratio of favourable outcomes to total outcomes.", styles)
    fraction(story, "P(A) =", "Number of favourable outcomes", "Total number of possible outcomes", "", styles)
    fraction(story, "P(A) =", "m", "n", "", styles)

    section(story, "Complement rule", styles)
    equation(story, "P(A′) = 1 − P(A)", styles)
    equation(story, "P(A) + P(A′) = 1", styles)
    equation(story, "P(At least one) = 1 − P(None)", styles)
    equation(story, "P(At least one success) = 1 − (1 − p)ⁿ", styles)

    section(story, "Addition rule", styles)
    equation(story, "P(A ∪ B) = P(A) + P(B) − P(A ∩ B)", styles)
    text(story, "The intersection is subtracted because it is counted once in P(A) and again in P(B). For mutually exclusive events, P(A ∩ B) = 0.", styles)
    equation(story, "A ∩ B = ∅  ⟹  P(A ∪ B) = P(A) + P(B)", styles)
    equation(story, "P(Neither A nor B) = 1 − P(A ∪ B)", styles)
    equation(story, "P(A only) = P(A) − P(A ∩ B)", styles)

    chapter(story, 7, "Counting Techniques", "Multiplication principle, permutations, combinations, and repeated objects", styles)
    section(story, "Fundamental principle of counting", styles)
    text(story, "If successive operations can be performed in n₁, n₂, …, nₖ ways, multiply the numbers of choices.", styles)
    equation(story, "Total Outcomes = n₁ × n₂ × ⋯ × nₖ", styles)
    text(story, "If restrictions create separate non-overlapping cases, calculate each case independently and then add the results.", styles)

    section(story, "Permutations", styles)
    text(story, "A permutation is an arrangement in which order matters.", styles)
    fraction(story, "ⁿPᵣ =", "n!", "(n − r)!", "", styles)

    section(story, "Permutations with identical objects", styles)
    fraction(story, "Number of arrangements =", "n!", "n₁!n₂! ⋯ nₖ!", "", styles)

    section(story, "Combinations", styles)
    text(story, "A combination is a selection in which order does not matter.", styles)
    fraction(story, "ⁿCᵣ =", "n!", "r!(n − r)!", "", styles)
    equation(story, "ⁿPᵣ = ⁿCᵣ r!", styles)

    chapter(story, 8, "Conditional Probability and Independence", "Reduced sample spaces, product rules, and probability trees", styles)
    section(story, "Conditional probability", styles)
    text(story, "Conditional probability measures the probability of B after A is known to have occurred. The event after the vertical bar determines the reduced sample space.", styles)
    fraction(story, "P(B|A) =", "P(A ∩ B)", "P(A)", "   P(A) > 0", styles)
    fraction(story, "P(A|B) =", "P(A ∩ B)", "P(B)", "   P(B) > 0", styles)
    fraction(story, "P(B|A) =", "n(A ∩ B)", "n(A)", "", styles)

    section(story, "Product rule", styles)
    text(story, "The product rule is used for intersections and sequential events. In a tree diagram, probabilities are multiplied along a branch.", styles)
    equation(story, "P(A ∩ B) = P(A)P(B|A)", styles)
    equation(story, "P(A ∩ B) = P(B)P(A|B)", styles)
    equation(story, "P(A ∩ B ∩ C) = P(A)P(B|A)P(C|A ∩ B)", styles)

    section(story, "Independent events", styles)
    text(story, "Events are independent when the occurrence of one does not change the probability of the other.", styles)
    equation(story, "P(B|A) = P(B)", styles)
    equation(story, "P(A|B) = P(A)", styles)
    equation(story, "P(A ∩ B) = P(A)P(B)", styles)
    note(story, "Independent events are not the same as mutually exclusive events. Without-replacement selections are normally dependent because the first selection changes the remaining sample space.", styles)

    chapter(story, 9, "Total Probability and Bayes' Theorem", "Combining possible causes and reversing conditional probability", styles, break_before=False)
    section(story, "Partition of the sample space", styles)
    text(story, "Suppose B₁, B₂, …, Bₖ are mutually exclusive and collectively exhaustive causes.", styles)
    equation(story, "Bᵢ ∩ Bⱼ = ∅,  i ≠ j", styles)
    equation(story, "⋃ᵢ₌₁ᵏ Bᵢ = S", styles)

    section(story, "Law of total probability", styles)
    text(story, "An outcome A may occur through several different causes. Multiply the probability of each cause by the conditional probability of A under that cause, then add all matching branches.", styles)
    equation(story, "P(A) = Σᵢ₌₁ᵏ P(Bᵢ)P(A|Bᵢ)", styles)
    equation(story, "P(A) = P(B₁)P(A|B₁) + P(B₂)P(A|B₂) + P(B₃)P(A|B₃)", styles)

    section(story, "Bayes' theorem", styles)
    text(story, "Bayes' theorem reverses the conditional direction. Once evidence A is observed, it calculates the probability that a particular cause Bᵣ produced that evidence.", styles)
    fraction(story, "P(Bᵣ|A) =", "P(Bᵣ)P(A|Bᵣ)", "P(A)", "", styles)
    fraction(story, "P(Bᵣ|A) =", "P(Bᵣ)P(A|Bᵣ)", "Σᵢ₌₁ᵏ P(Bᵢ)P(A|Bᵢ)", "", styles)
    equation(story, "P(Bᵣ) = Prior Probability", styles)
    equation(story, "P(A|Bᵣ) = Likelihood", styles)
    equation(story, "P(A) = Evidence", styles)
    equation(story, "P(Bᵣ|A) = Posterior Probability", styles)

    section(story, "Diagnostic-test form", styles)
    text(story, "Let C represent disease present and D represent a positive diagnosis. The total positive-diagnosis probability includes both true positives and false positives.", styles)
    equation(story, "P(C ∩ D) = P(C)P(D|C)", styles)
    equation(story, "P(D) = P(C)P(D|C) + P(C′)P(D|C′)", styles)
    fraction(story, "P(C|D) =", "P(C)P(D|C)", "P(C)P(D|C) + P(C′)P(D|C′)", "", styles)

    chapter(story, 10, "Examination Method", "A short procedure for selecting and applying the correct formula", styles)
    section(story, "Descriptive-statistics questions", styles)
    text(story, "First classify the data as ungrouped, discrete frequency, or continuous grouped. For continuous data calculate midpoints. Construct the required columns such as fᵢxᵢ, cumulative frequency, deviations, squared deviations, or higher powers. Verify that Σfᵢ = N before using the formula.", styles)
    section(story, "Probability questions", styles)
    text(story, "Translate 'or' as ∪, 'and' as ∩, 'not' as a complement, and 'given' as conditional probability. Use the general addition rule unless the events are definitely mutually exclusive. For a probability tree, multiply along each branch and add branches that lead to the required outcome.", styles)
    section(story, "Interpretation", styles)
    text(story, "End the calculation with its meaning. State the units of a statistical measure, the direction of skewness, the type of kurtosis, which dataset is more consistent, or the meaning of a conditional or posterior probability.", styles)

    append_worked_worksheets(
        story, styles, chapter, section, text, note, equation, fraction
    )

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    print(OUTPUT)


if __name__ == "__main__":
    build()
