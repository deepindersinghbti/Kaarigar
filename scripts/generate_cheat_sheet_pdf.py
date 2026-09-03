from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "probability_statistics_ultimate_cheat_sheet.pdf"

NAVY = colors.HexColor("#12304A")
TEAL = colors.HexColor("#117B83")
MINT = colors.HexColor("#E8F5F3")
SKY = colors.HexColor("#EDF5FA")
WARM = colors.HexColor("#FFF5E5")
INK = colors.HexColor("#17212B")
MUTED = colors.HexColor("#52616B")
GRID = colors.HexColor("#CAD7DE")


def p(text, style):
    return Paragraph(text, style)


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(GRID)
    canvas.line(doc.leftMargin, 13 * mm, A4[0] - doc.rightMargin, 13 * mm)
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(doc.leftMargin, 8.5 * mm, "Probability & Statistics - exam formula sheet")
    canvas.drawRightString(A4[0] - doc.rightMargin, 8.5 * mm, f"Page {doc.page}")
    canvas.restoreState()


def section_heading(title, subtitle, styles):
    box = Table(
        [[p(f"<b>{title}</b><br/><font color='#DCEFF1'>{subtitle}</font>", styles["section"]) ]],
        colWidths=[174 * mm],
    )
    box.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), NAVY),
                ("BOX", (0, 0), (-1, -1), 0.5, NAVY),
                ("LEFTPADDING", (0, 0), (-1, -1), 9),
                ("RIGHTPADDING", (0, 0), (-1, -1), 9),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    return [Spacer(1, 5 * mm), box, Spacer(1, 2.4 * mm)]


def formula_table(rows, styles, tint=SKY):
    data = [[p("<b>Formula / rule</b>", styles["table_head"]), p("<b>Use it when... / exam move</b>", styles["table_head"])]]
    for formula, use in rows:
        data.append([p(formula, styles["formula"]), p(use, styles["cell"])])
    table = Table(data, colWidths=[65 * mm, 109 * mm], repeatRows=1, hAlign="LEFT")
    commands = [
        ("BACKGROUND", (0, 0), (-1, 0), TEAL),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.35, GRID),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 1), (-1, -1), 4.5),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 4.5),
    ]
    for row in range(1, len(data)):
        if row % 2 == 1:
            commands.append(("BACKGROUND", (0, row), (-1, row), tint))
    table.setStyle(TableStyle(commands))
    return table


def quick_table(rows, styles):
    data = [[p("<b>If the question says...</b>", styles["table_head"]), p("<b>Go to...</b>", styles["table_head"])]]
    data += [[p(a, styles["cell"]), p(b, styles["cell"])] for a, b in rows]
    table = Table(data, colWidths=[82 * mm, 92 * mm], repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), TEAL),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.35, GRID),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 4.5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4.5),
                ("BACKGROUND", (0, 1), (-1, -1), MINT),
            ]
        )
    )
    return table


def build():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="cs_title", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=22, leading=26, textColor=NAVY, alignment=TA_CENTER, spaceAfter=4))
    styles.add(ParagraphStyle(name="subtitle", parent=styles["Normal"], fontName="Helvetica", fontSize=10, leading=14, textColor=MUTED, alignment=TA_CENTER))
    styles.add(ParagraphStyle(name="section", parent=styles["Normal"], fontName="Helvetica", fontSize=12, leading=16, textColor=colors.white))
    styles.add(ParagraphStyle(name="body", parent=styles["Normal"], fontName="Helvetica", fontSize=8.4, leading=11.2, textColor=INK))
    styles.add(ParagraphStyle(name="cell", parent=styles["Normal"], fontName="Helvetica", fontSize=7.55, leading=9.8, textColor=INK))
    styles.add(ParagraphStyle(name="formula", parent=styles["Normal"], fontName="Courier", fontSize=7.6, leading=9.9, textColor=INK))
    styles.add(ParagraphStyle(name="table_head", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=7.7, leading=9.6, textColor=colors.white))
    styles.add(ParagraphStyle(name="tiny", parent=styles["Normal"], fontName="Helvetica", fontSize=7.3, leading=9.4, textColor=MUTED))

    doc = SimpleDocTemplate(
        str(OUTPUT), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=19 * mm,
        title="Ultimate Probability and Statistics Exam Cheat Sheet",
        author="Codex",
    )
    story = []
    story += [
        Spacer(1, 4 * mm),
        p("ULTIMATE PROBABILITY & STATISTICS", styles["cs_title"]),
        p("Formula-first revision sheet - what to use, when to use it, and the traps that lose marks", styles["subtitle"]),
        Spacer(1, 5 * mm),
    ]

    starter = Table(
        [[
            p("<b>1. Classify the data</b><br/>Ungrouped? Discrete frequency? Continuous class intervals? Probability table/tree?", styles["body"]),
            p("<b>2. Build the working table</b><br/>For stats: x, f, CF, midpoint. For probability: events, complements, branch probabilities.", styles["body"]),
            p("<b>3. Interpret last</b><br/>State units, direction of skewness, tail type, or what the conditional probability means.", styles["body"]),
        ]], colWidths=[58 * mm, 58 * mm, 58 * mm]
    )
    starter.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), WARM), ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E8C98B")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story += [starter]
    story += section_heading("Notation you must define once", "Use N = sum f for grouped data; x is a value or class midpoint.", styles)
    notation = [
        ("x, x-bar, f, N", "x = observation or class midpoint; x-bar = mean; f = frequency; N = sum f."),
        ("L, h, CF&lt;, f_m", "For grouped interpolation: L = lower limit of target class, h = class width, CF&lt; = cumulative frequency before it, f_m = target-class frequency."),
        ("Q1, Q2, Q3; Dk; Pk", "Quartiles, deciles, percentiles. Q2 is the median."),
        ("A, d, u", "Assumed mean A; d = x - A; u = d / h for step-deviation."),
        ("P(A), P(B|A), A cap B", "Probability of A; probability of B given A; intersection = both events."),
    ]
    story += [formula_table(notation, styles, MINT)]
    story += section_heading("Fast formula selector", "The wording often tells you the method before any calculation begins.", styles)
    selector = [
        ("Typical value, no serious outliers", "Mean. Use weighted mean if observations have different importance."),
        ("Middle / typical value with outliers, skewed data", "Median. For continuous grouping, use the interpolation formula."),
        ("Most common category/value", "Mode. It is the only central measure usable for nominal categories."),
        ("Top x%, bottom x%, SLA covers 95%", "Percentile: top x% = P(100-x); bottom x% = Px; SLA threshold often P95 or P99."),
        ("Consistency / compare two systems on different scales", "Coefficient of variation. Lower CV means more consistent."),
        ("Direction of asymmetry / tail risk", "Skewness and kurtosis (usually after calculating central moments)."),
        ("Given that / among those / conditional table", "Conditional probability. Denominator is the total of the GIVEN condition."),
        ("Causes form cases; need overall chance", "Law of total probability. Multiply down each case, then add."),
        ("Observed effect; need likely cause", "Bayes theorem. Numerator = one cause's branch; denominator = all matching branches."),
    ]
    story += [quick_table(selector, styles)]
    story.append(PageBreak())

    story += section_heading("1. Central tendency", "Before grouped-data work, calculate N = sum f. For continuous classes, x means midpoint.", styles)
    central = [
        ("x-bar = sum x / n", "<b>Ungrouped arithmetic mean.</b> Use for a typical value when all observations count equally."),
        ("x-bar = sum(fx) / sum f", "<b>Discrete frequency or continuous grouped mean.</b> For continuous intervals, first take midpoint x = (lower + upper) / 2."),
        ("xw = sum(wx) / sum w", "<b>Weighted mean.</b> Use when traffic, credits, importance, or sample sizes differ. Never divide by number of groups unless weights are equal."),
        ("x-bar = A + sum d / n", "<b>Assumed-mean shortcut, ungrouped.</b> Take d = x - A. Choose a convenient central A."),
        ("x-bar = A + sum(fd) / sum f", "<b>Assumed-mean shortcut, grouped.</b> Same result as direct method; reduces arithmetic."),
        ("x-bar = A + [sum(fu) / sum f] h", "<b>Step deviation.</b> Use when midpoint differences share class width h; u = (x-A)/h."),
        ("correct mean = wrong mean + sum(correct - wrong) / n", "<b>Correcting a mean.</b> Convert the original mean to its total first, then replace every misread value. Works for one or many errors."),
        ("Median, odd n: value at (n+1)/2", "<b>Ungrouped data.</b> Sort first. Position, not original order, determines the median."),
        ("Median, even n: [x(n/2) + x(n/2+1)] / 2", "<b>Ungrouped even n.</b> Sort first, then average the two middle observations."),
        ("Discrete grouped median: value whose CF first reaches (N+1)/2", "<b>Discrete frequency table.</b> Make CF, find the position, and report the corresponding x value - no interpolation."),
        ("Median = L + [(N/2 - CF&lt;) / f_m] h", "<b>Continuous grouped median.</b> Find the class whose CF first reaches N/2, then interpolate. It is an estimate."),
        ("Mode = value with largest f", "<b>Ungrouped or discrete grouped.</b> Can be none or more than one. Use for most frequent category/value."),
        ("Mode = L + [(f1-f0)/(2f1-f0-f2)] h", "<b>Continuous grouped mode.</b> f1 = modal-class frequency; f0 and f2 are preceding/following class frequencies."),
    ]
    story += [formula_table(central, styles)]
    story += section_heading("2. Positional averages", "Locate the target position with CF, then interpolate only for continuous grouped data.", styles)
    positional = [
        ("Ungrouped Qk position = k(n+1)/4", "k = 1, 2, 3. Sort the data. If position is fractional, linearly interpolate between adjacent values."),
        ("Ungrouped Dk position = k(n+1)/10", "k = 1 to 9. D5 is the median (50th percentile)."),
        ("Ungrouped Pk position = k(n+1)/100", "k = 1 to 99. The course notes use this positional convention; follow the exam's stated convention if it differs."),
        ("Grouped Qk = L + [(kN/4 - CF&lt;) / fQ] h", "Find the class whose CF reaches kN/4. Q1 = 25th percentile, Q2 = median, Q3 = 75th percentile."),
        ("Grouped Dk = L + [(kN/10 - CF&lt;) / fD] h", "Find the class whose CF reaches kN/10."),
        ("Grouped Pk = L + [(kN/100 - CF&lt;) / fP] h", "Find the class whose CF reaches kN/100. P95/P99 are common SLA cutoffs."),
        ("IQR = Q3 - Q1; QD = (Q3-Q1)/2", "<b>Middle spread.</b> Use IQR/QD when outliers make range or SD misleading. Middle 50% lies from Q1 to Q3."),
    ]
    story += [formula_table(positional, styles, MINT)]
    story.append(PageBreak())

    story += section_heading("3. Dispersion and consistency", "Use an absolute measure for actual spread; use a coefficient to compare different scales.", styles)
    spread = [
        ("Range = maximum - minimum", "Quick rough spread. Highly sensitive to outliers; not suitable for open-ended classes."),
        ("Coefficient of range = (max-min)/(max+min)", "Unit-free version of range. Use to compare relative ranges across scales."),
        ("MD about mean = sum|x-x-bar| / n", "<b>Ungrouped mean deviation.</b> Use absolute values because signed deviations from the mean sum to 0."),
        ("MD grouped = sum[f|x-x-bar|] / sum f", "<b>Grouped mean deviation.</b> In continuous data use midpoint x."),
        ("Coefficient of MD = MD / mean", "Use if mean deviation has already been calculated and a relative comparison is requested."),
        ("Population variance: sigma^2 = sum(x-mu)^2 / N", "Use for a complete population. Units are squared."),
        ("Sample variance: s^2 = sum(x-x-bar)^2 / (n-1)", "Use for a sample when the question explicitly asks for sample variance/SD."),
        ("Grouped variance = sum[f(x-x-bar)^2] / sum f", "<b>Course population-style grouped variance.</b> Use midpoint x for continuous classes."),
        ("sigma = sqrt(variance)", "Standard deviation: preferred spread measure; same units as data and gives extra weight to large deviations."),
        ("variance = sum(x^2)/n - (x-bar)^2", "<b>Computational shortcut, ungrouped.</b> Useful when sum x and sum x^2 are given. For grouped data use sum(fx^2)/N - (x-bar)^2."),
        ("CV = (SD / mean) x 100%", "<b>Compare consistency.</b> Lower CV = less relative variability = more consistent. Do not choose using SD alone when means/scales differ."),
        ("Coefficient of QD = (Q3-Q1)/(Q3+Q1)", "Relative, robust spread. Use when data are skewed or contain outliers."),
    ]
    story += [formula_table(spread, styles)]
    story += section_heading("4. Skewness, kurtosis, and central moments", "For a moments question, make columns for d, d^2, d^3, d^4 (and multiply each by f when grouped).", styles)
    shape = [
        ("Karl Pearson Sk = (mean-mode)/SD", "Use when a clear unique mode exists. Sk &gt; 0 right skew; Sk &lt; 0 left skew; Sk = 0 symmetric."),
        ("Karl Pearson Sk = 3(mean-median)/SD", "Use when mode is missing, unreliable, or multimodal. This is often the safer exam formula."),
        ("Bowley Sk = (Q3+Q1-2Q2)/(Q3-Q1)", "Quartile-based and robust to outliers. Between -1 and +1. Use when Q1, median, Q3 are given."),
        ("mu_r = sum[(x-x-bar)^r]/n", "<b>Central moment, ungrouped.</b> For grouped data: mu_r = sum[f(x-x-bar)^r] / sum f."),
        ("mu1 = 0; mu2 = variance; SD = sqrt(mu2)", "First check: mu1 must be zero (apart from rounding). Second moment measures spread."),
        ("gamma1 = mu3 / mu2^(3/2)", "<b>Moment skewness, signed.</b> Positive = right skew; negative = left skew."),
        ("beta1 = mu3^2 / mu2^3", "<b>Moment coefficient of skewness.</b> Non-negative; use gamma1's sign from mu3 when interpretation asks direction."),
        ("beta2 = mu4 / mu2^2", "<b>Kurtosis.</b> beta2 = 3 mesokurtic; &gt;3 leptokurtic (heavy tails); &lt;3 platykurtic (light tails)."),
        ("excess kurtosis = beta2 - 3", "Use only if the question explicitly asks for excess kurtosis. Normal distribution then has excess 0."),
        ("Mean = median = mode: symmetric", "Mean &gt; median &gt; mode: positive/right skew. Mean &lt; median &lt; mode: negative/left skew."),
    ]
    story += [formula_table(shape, styles, WARM)]

    story += section_heading("5. Counting and basic probability", "Translate first: AND across stages = multiply; OR across distinct cases = add; order matters = permutation.", styles)
    counting = [
        ("Total outcomes = n1 x n2 x ... x nk", "<b>Fundamental counting principle.</b> Use for sequential choices/stages. Apply restrictions by splitting into non-overlapping cases, then add."),
        ("n! = n(n-1)...1; 0! = 1", "Foundation for permutations/combinations."),
        ("nPr = n!/(n-r)!", "<b>Permutation.</b> Use when positions, awards, ranks, or sequences differ: order matters."),
        ("nCr = n!/[r!(n-r)!]", "<b>Combination.</b> Use when selecting a team, hand, features, or subset: order does not matter."),
        ("Distinct arrangements = n!/(n1! n2! ... nk!)", "Use when some objects are identical, e.g. letters in a word. Divide by factorial for each repeated group."),
        ("P(A) = favourable outcomes / total outcomes", "Classical probability: only when all listed outcomes are equally likely."),
        ("0 <= P(A) <= 1; P(S) = 1", "Sanity check for every answer. A negative probability or one above 1 is impossible."),
        ("P(A') = 1 - P(A)", "<b>Complement.</b> Best for 'at least one', 'none', 'not', or a long OR list."),
        ("P(A union B) = P(A)+P(B)-P(A cap B)", "<b>General addition/inclusion-exclusion.</b> Use for A OR B when overlap is possible; subtract the overlap once."),
        ("If A cap B is empty: P(A union B) = P(A)+P(B)", "Add directly only for mutually exclusive events. 'Independent' does NOT mean mutually exclusive."),
        ("P(at least one) = 1 - P(none)", "For independent repeated trials with success p: P(at least one success) = 1 - (1-p)^n."),
    ]
    story += [formula_table(counting, styles)]
    story += section_heading("6. Conditional probability and product rule", "A condition after the vertical bar changes the denominator - restrict the sample space to that condition.", styles)
    conditional = [
        ("P(B|A) = P(A cap B) / P(A)", "<b>Conditional probability.</b> Use for 'given A', 'among A', a row/column of a contingency table. Requires P(A) &gt; 0."),
        ("P(A cap B) = P(A) P(B|A)", "<b>General product rule.</b> Use for A AND B, especially dependent sequential draws / tree branches."),
        ("P(A cap B) = P(B) P(A|B)", "Same intersection, reverse order. Pick the conditional probability provided in the question."),
        ("Independent iff P(A cap B)=P(A)P(B)", "Equivalent to P(B|A)=P(B), provided P(A)&gt;0. With replacement is often independent; without replacement is usually dependent."),
        ("Without replacement: update counts", "After a first draw, reduce total by 1 and reduce the selected type by 1 if it was drawn. Multiply branch probabilities."),
        ("Contingency table: P(row|column) = cell / column total", "The denominator is the total named after 'given'. For P(male | secondary), divide by total secondary - not grand total."),
        ("P(A only) = P(A)-P(A cap B)", "Use for 'A but not B'. For 'neither A nor B', use 1 - P(A union B)."),
    ]
    story += [formula_table(conditional, styles, MINT)]
    story.append(PageBreak())

    story += section_heading("7. Law of total probability and Bayes theorem", "Draw a two-stage tree whenever there are sources/causes and a result. Multiply along branches; add matching endpoints.", styles)
    bayes = [
        ("P(A) = sum P(Bi) P(A|Bi)", "<b>Law of total probability.</b> Use when B1...Bk are mutually exclusive and exhaustive causes (a partition), and you need overall P(A)."),
        ("P(Br|A) = P(Br)P(A|Br) / sum[P(Bi)P(A|Bi)]", "<b>Bayes theorem.</b> Use when evidence A is observed and the question asks which source/cause Br is most likely."),
        ("Bayes numerator = prior x likelihood", "For one candidate cause: P(Br) x P(A|Br). Do not omit the prior/base rate."),
        ("Bayes denominator = P(A)", "Get it by total probability: add every branch that ends in observed evidence A. Posterior probabilities across all causes must sum to 1."),
        ("Diagnostic test: P(disease|positive)", "Use prevalence as prior, sensitivity as P(positive|disease), and false-positive rate as P(positive|no disease). Low prevalence can make a positive result much less certain than expected."),
        ("Sequential inspection / stage reached", "To be rejected at stage 3, multiply: survive 1 x survive 2 x reject 3. Include all prior conditions needed to reach a stage."),
    ]
    story += [formula_table(bayes, styles)]
    story += section_heading("8. Exam recipes and mark-saving checks", "Write the structure, then substitute numbers. A correct formula with clearly identified symbols earns method marks.", styles)
    recipes = [
        ("Grouped statistics", "1) Make x (midpoint), f, fx, CF. 2) Check sum f = N. 3) Identify target class from CF. 4) Use L, CF&lt;, f, h. 5) State result is an estimate for continuous grouping."),
        ("Moments question", "1) Find mean. 2) Make d = x-x-bar. 3) compute f d^2, f d^3, f d^4. 4) Divide sums by N for mu2, mu3, mu4. 5) calculate SD, skewness, beta2 and interpret."),
        ("Correction of mean", "Wrong total = n x wrong mean. Correct total = wrong total - wrong entries + true entries. Correct mean = correct total/n."),
        ("Two-event probability", "Write 'OR' as union and 'AND' as intersection. Use general addition unless the events really cannot happen together."),
        ("Conditional table", "Circle/underline the word after 'given'. Sum that row/column for denominator; cell overlap is numerator."),
        ("Bayes/tree", "Branches start with priors, then conditional probabilities. Multiply down. Add matching leaf branches for evidence. Divide desired branch by evidence total."),
        ("Common traps", "Do not: use N+1 over 2 inside the continuous median formula; use mode formula for discrete data; compare SD instead of CV across scales; add overlapping probabilities; confuse P(A|B) with P(B|A); forget complementary branches sum to 1."),
        ("Final line of an answer", "Give units and meaning: 'P95 = ... ms, so 95% of observations are at or below this value'; 'CV A &lt; CV B, so A is more consistent'; 'Sk &gt; 0, so right-skewed.'"),
    ]
    story += [formula_table(recipes, styles, WARM)]
    story += [Spacer(1, 3 * mm), p("Coverage: lectures 1-14 and worksheets 1-3. This sheet preserves the course conventions for grouped data while flagging the conditions needed before simplifying a probability rule.", styles["tiny"])]
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    print(OUTPUT)


if __name__ == "__main__":
    build()
