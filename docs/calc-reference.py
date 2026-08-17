# -*- coding: utf-8 -*-
"""
AI×お金の健康 / 必要保障額 算定エンジン（grill後 v0.2）
- 世帯単位（本人・配偶者の両方の死亡ケースを算定）  ... ADR-007
- 算定期間は「遺された配偶者が65歳まで」で一律。就労収入を連続推定して控除 ... grill Q3/Q3-b
- 医療判定は公的統計ベース＋当社基準の明示 ... grill Q4
すべての慣行値は PARAMS に集約（コードにハードコードしない）... ADR-004
"""

PARAMS = {
    # ---- 公的年金（令和8年度・報道値ベース = verified:false）----
    "izoku_kiso_base":        847_500,   # 遺族基礎年金 基本額/年
    "child_add_1_2":          243_900,   # 子の加算 第1・2子/年
    "child_add_3plus":         81_300,   # 子の加算 第3子以降/年
    "chukorei_kafu_add":      635_700,   # 中高齢寡婦加算/年
    "hoshu_hirei_coef":         0.005481,# 報酬比例乗率
    "izoku_kosei_ratio":        0.75,    # 報酬比例部分の3/4
    "minimum_insured_months":     300,   # みなし300月
    "reform2028_years":             5,   # 子なし配偶者の有期給付年数

    # ---- 当社基準（出典が取れない慣行値。結果画面で本人が動かせる）... grill Q8 ----
    "survivor_living_ratio_child":  0.70,  # 子育て期の遺族生活費率
    "survivor_living_ratio_alone":  0.50,  # 末子独立後の配偶者生活費率
    "net_income_ratio":             0.80,  # 年収→手取り
    "living_cost_from_income":      0.75,  # 年収から生活費を推定する場合

    # ---- 出典が取れる想定（要一次情報確認）... grill Q4/Q8 ----
    "funeral_reserve":        2_000_000,   # 葬儀・予備費（民間調査ベース）
    "education_public":      10_000_000,   # 教育費/人（公立中心・文科省+日本公庫）
    "education_mixed":       15_000_000,
    "education_private":     20_000_000,
    "hospital_months_std":            1,   # 標準入院（患者調査 平均在院日数ベース）
    "hospital_months_long":           3,   # 長期化ケース
    "uncovered_medical_monthly": 100_000,  # 保険外費用/月（差額ベッド・食事・雑費）
    "self_insure_multiple":           3,   # 自己保険と判定する資産倍率（当社基準）

    # ---- 就労収入の連続推定（崖をなくす）... grill Q3-b ----
    "post_indep_min_income":  1_000_000,   # 末子独立後の最低就労推定（パート相当）/年

    "child_indep_age":               22,   # 独立年齢
    "pension_age":                   65,
}

# 高額療養費（70歳未満・2026年8月〜）
KOGAKU = [
    ("区分ア", 11_600_000, lambda m: 270_300 + max(0, m - 901_000) * 0.01),
    ("区分イ",  7_700_000, lambda m: 179_100 + max(0, m - 597_000) * 0.01),
    ("区分ウ",  3_700_000, lambda m:  85_800 + max(0, m - 286_000) * 0.01),
    ("区分エ",          0, lambda m:  61_500),
]
ASSUMED_MEDICAL_COST = 1_000_000  # 月あたり医療費（3割負担前の総額）想定


def kogaku_cap(annual_income):
    for name, th, f in KOGAKU:
        if annual_income >= th:
            return name, f(ASSUMED_MEDICAL_COST)
    return "区分エ", 61_500


def izoku_kiso_annual(children_ages):
    """その年に受け取れる遺族基礎年金（18歳到達年度末まで在籍する子で計算）"""
    n = len([a for a in children_ages if a < 18])
    if n == 0:
        return 0
    add = 0
    for i in range(n):
        add += PARAMS["child_add_1_2"] if i < 2 else PARAMS["child_add_3plus"]
    return PARAMS["izoku_kiso_base"] + add


def izoku_kosei_annual(annual_income):
    if annual_income <= 0:
        return 0
    avg_monthly = annual_income / 12
    hoshu_hirei = avg_monthly * PARAMS["hoshu_hirei_coef"] * PARAMS["minimum_insured_months"]
    return hoshu_hirei * PARAMS["izoku_kosei_ratio"]


def diagnose_one(deceased, survivor, children, housing, assets, monthly_living,
                 education_plan="public", now_coverage=None):
    """
    deceased : {"age":int, "income":int, "employment":"employee"|"self"}   亡くなる側
    survivor : {"age":int, "income":int}                                   遺される側（Noneなら独身）
    children : [age, ...]
    housing  : {"type":"own"|"rent", "loan":int, "danshin":bool}
    """
    P = PARAMS
    res = {}

    # ---------- 期間 ----------
    if children:
        y_dep = max(0, P["child_indep_age"] - min(children))
    else:
        y_dep = 0
    if survivor:
        y_total = max(0, P["pension_age"] - survivor["age"])
    else:
        y_total = 0
    y_alone = max(0, y_total - y_dep)   # 末子独立後〜配偶者65歳
    y_dep_eff = min(y_dep, y_total)     # 配偶者が先に65歳になる場合の丸め

    # ---------- 支出 E ----------
    e_living_child = monthly_living * P["survivor_living_ratio_child"] * 12 * y_dep_eff
    e_living_alone = monthly_living * P["survivor_living_ratio_alone"] * 12 * y_alone
    unit = {"public": P["education_public"], "mixed": P["education_mixed"],
            "private": P["education_private"]}[education_plan]
    e_edu = sum(unit * max(0, (P["child_indep_age"] - a)) / P["child_indep_age"] for a in children)
    if housing["type"] == "own" and housing.get("loan", 0) > 0 and not housing.get("danshin", True):
        e_house = housing["loan"]
    else:
        e_house = 0   # 団信あり=0 / 賃貸は家賃を monthly_living に含む
    e_funeral = P["funeral_reserve"]
    E = e_living_child + e_living_alone + e_edu + e_house + e_funeral

    # ---------- 収入 I ----------
    i_kiso = 0
    i_kosei = 0
    i_chukorei = 0
    i_work = 0
    if survivor:
        kosei_annual = 0 if deceased.get("employment") == "self" else izoku_kosei_annual(deceased["income"])
        has_child = len(children) > 0
        # 遺族厚生年金の受給年数
        if has_child:
            y_kosei = y_total
        else:
            y_kosei = min(P["reform2028_years"], y_total)   # 2028年改正：子なし配偶者は原則5年
        i_kosei = kosei_annual * y_kosei

        # 遺族基礎年金：年ごとに子の年齢を進めて積算
        for t in range(y_total):
            ages = [a + t for a in children]
            i_kiso += izoku_kiso_annual(ages)

        # 中高齢寡婦加算
        #  ・子あり：遺族基礎が終わった後〜65歳、かつ40歳以上の期間
        #  ・子なし：死亡時に40歳以上であることが要件（30代の妻には出ない）※要一次情報確認
        if has_child:
            y_kiso_end = max(0, 18 - min(children))
            for t in range(y_kiso_end, y_total):
                if survivor["age"] + t >= 40:
                    i_chukorei += P["chukorei_kafu_add"]
        else:
            if survivor["age"] >= 40:
                for t in range(y_total):
                    i_chukorei += P["chukorei_kafu_add"]

        # 就労収入（連続推定：崖をつくらない）
        net_now = survivor["income"] * P["net_income_ratio"]
        i_work += net_now * y_dep_eff
        net_after = max(net_now, P["post_indep_min_income"])
        i_work += net_after * y_alone

    i_assets = assets
    I = i_kiso + i_kosei + i_chukorei + i_work + i_assets

    raw = max(0, E - I)

    # ---------- レンジ・判定 ----------
    def r100(x):
        return round(x / 1_000_000) * 1_000_000
    margin = I - E
    if raw >= 3_000_000:
        low, high = r100(raw * 0.8), r100(raw * 1.2)
        verdict = "shortage"
    elif survivor is None and not children:
        # 扶養家族がいない：上乗せの概念がない。葬儀・予備費のみ
        low = high = r100(e_funeral)
        verdict = "not_needed"
    elif margin > E * 0.2:
        # 余剰が大きい：上乗せも不要と正直に言う（煽らない）
        low = high = r100(e_funeral)
        verdict = "ample"
    else:
        base = e_funeral
        low = r100(base + monthly_living * P["survivor_living_ratio_child"] * 12)
        high = r100(base + monthly_living * P["survivor_living_ratio_child"] * 24)
        verdict = "sufficient"
    res_margin = margin

    res.update(dict(
        E=E, e_living_child=e_living_child, e_living_alone=e_living_alone,
        e_edu=e_edu, e_house=e_house, e_funeral=e_funeral,
        I=I, i_kiso=i_kiso, i_kosei=i_kosei, i_chukorei=i_chukorei,
        i_work=i_work, i_assets=i_assets,
        raw=raw, low=low, high=high, verdict=verdict, margin=res_margin,
        y_dep=y_dep_eff, y_alone=y_alone, y_total=y_total,
    ))

    # 現在の保障との比較
    if now_coverage is not None:
        if now_coverage < low:
            res["gap"] = ("shortage", low - now_coverage)
        elif now_coverage > high * 1.5:
            res["gap"] = ("excess", now_coverage - high)
        else:
            res["gap"] = ("adequate", 0)
    return res


def diagnose_medical(annual_income, assets):
    cat, cap = kogaku_cap(annual_income)
    P = PARAMS
    std = cap * P["hospital_months_std"] + P["uncovered_medical_monthly"] * P["hospital_months_std"]
    lng = cap * P["hospital_months_long"] + P["uncovered_medical_monthly"] * P["hospital_months_long"]
    if assets >= lng * P["self_insure_multiple"]:
        v = "self_insurable"
    elif assets >= lng:
        v = "partial"
    else:
        v = "needed"
    return dict(category=cat, cap=cap, burden_std=std, burden_long=lng, verdict=v)
