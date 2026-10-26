# -*- coding: utf-8 -*-
"""Rebuild the solver's two-character word list (words.tsv) from public sources.

Run order:
  1. Keep the original jieba list as C:\\coding\\script\\bgacn\\words.jieba.tsv
     (the script reads it as the baseline).
  2. Download the sources into this project directory:
       _clover/clover.schema-1.1.4.zip
         https://github.com/fkxxyz/rime-cloverpinyin/releases/download/1.1.4/clover.schema-1.1.4.zip
       _dicts/cedict.zip
         https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.zip
       _dicts/subtlex.zip
         https://journals.plos.org/plosone/article/file?type=supplementary&id=10.1371/journal.pone.0010729.s002
  3. python merge_dict.py
  4. Copy _dicts/merged.tsv over C:\\coding\\script\\bgacn\\words.tsv and rebuild index.html.

Selection rules: jieba words keep their frequencies; new CC-CEDICT/SUBTLEX words with a
common part-of-speech tag enter the common tier (SUBTLEX frequency mapped to the jieba
scale), everything else enters the rare tier at 5; particle/pronoun bigrams and proper
nouns are demoted; a short curated list of modern words and THUOCL domain words are
handled separately.
"""
import zipfile, collections, math, sys

HERE = r"C:\coding\script\caizi-jiedi"
JIEBA_TSV = r"C:\coding\script\bgacn\words.jieba.tsv"

def han2(w):
    return len(w) == 2 and all(0x4E00 <= ord(c) <= 0x9FFF for c in w)

def load_defaults():
    d = {}
    with open(JIEBA_TSV, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            w, fs = line.rsplit(" ", 1)
            if len(w) == 2:
                d[w] = int(fs)
    return d

def load_clover():
    z = zipfile.ZipFile(HERE + r"\_clover\clover.schema-1.1.4.zip")
    def readlines(name):
        raw = z.read(name)
        try:
            return raw.decode("gb18030").splitlines()
        except Exception:
            return raw.decode("utf-8", "replace").splitlines()
    words = {}
    src = {}
    names = ["clover.phrase.dict.yaml", "THUOCL_animal.dict.yaml", "THUOCL_caijing.dict.yaml",
             "THUOCL_car.dict.yaml", "THUOCL_diming.dict.yaml", "THUOCL_food.dict.yaml",
             "THUOCL_IT.dict.yaml", "THUOCL_law.dict.yaml", "THUOCL_lishimingren.dict.yaml",
             "THUOCL_medical.dict.yaml", "sogou_new_words.dict.yaml"]
    for name in names:
        for line in readlines(name):
            if not line or line.startswith("#") or line.startswith("-"):
                continue
            p = line.split("\t")
            if len(p) < 3:
                continue
            w = p[0].strip()
            if not han2(w):
                continue
            try:
                wt = int(float(p[-1]))
            except ValueError:
                continue
            if wt > 0 and (w not in words or wt > words[w]):
                words[w] = wt
                src[w] = name.split(".")[0]
    return words, src

def load_cedict():
    z = zipfile.ZipFile(HERE + r"\_dicts\cedict.zip")
    s = set()
    for line in z.read("cedict_ts.u8").decode("utf-8").splitlines():
        if line.startswith("#") or not line.strip():
            continue
        p = line.split(" ", 2)
        if len(p) >= 3 and han2(p[1]):
            s.add(p[1])
    return s

def load_subtlex():
    z = zipfile.ZipFile(HERE + r"\_dicts\subtlex.zip")
    raw = z.read("SUBTLEX-CH-WF")
    for enc in ("gb18030", "utf-8-sig", "utf-8"):
        try:
            data = raw.decode(enc)
            break
        except Exception:
            continue
    wf = {}
    for line in data.splitlines():
        if not line or line.startswith('"'):
            continue
        p = line.split("\t")
        if len(p) < 2:
            continue
        w = p[0].strip()
        if not han2(w):
            continue
        try:
            c = int(p[1])
        except ValueError:
            continue
        wf[w] = c
    raw = z.read("SUBTLEX-CH-WF_PoS")
    for enc in ("gb18030", "utf-8-sig", "utf-8"):
        try:
            pdata = raw.decode(enc)
            break
        except Exception:
            continue
    pos = collections.defaultdict(collections.Counter)
    for line in pdata.splitlines():
        if not line or line.startswith('"'):
            continue
        p = line.split("\t")
        if len(p) < 5:
            continue
        lemma, w, tag, n = p[0].strip(), p[2].strip(), p[3].strip(), p[4].strip()
        try:
            c = int(n)
        except ValueError:
            c = 0
        if tag and tag != "-":
            if lemma:
                pos[lemma][tag] += c
            if w and w != "-":
                pos[w][tag] += c
    return wf, pos

PROPER = {"nr", "ns", "nt", "nz", "nrt", "nrf", "nrj"}
COMMON_POS = {"n", "v", "a", "d", "vn", "an", "ad", "b", "z"}
PARTICLE = set("的了着过地得吗呢吧啊呀哦嗯我你他她它们是在有不也都就还又要会能可让被把给从向对和与或而且之其此该等这那哪谁什么怎为以于由因但却则若如已曾正将太很更最再才只仅便即乃乎者所何亦矣焉哉罢啦哇哟哎")
WHITELIST = set("有的 要不 得了 来着 算了 罢了 而已 的话 似的 一样 一起 一定 一直 一般 一边 不过 不如 不论 不管 不仅 不但 与其 宁可 哪怕 除非 以便 以免 以及 之类 之一 于是 因此 但是 如果 虽然 即使 无论 只要 除了 关于 对于 至于 由于 为了 通过 根据 按照 经过 随着 沿着 朝着 当着 接着 跟着 作为 以为 认为 可见 可是 而且 然而 然后 否则 况且 何况 就是 还是 或是 也是 要是 若是 总是 老是 真是 只是".split())

BOOST = "微博 微信 点赞 网红 抖音 快手 热搜 手游 扫码 支付宝 电竞 中单 上单 下路 桌游 断网 电商 截图 外卖 淘宝 内卷 躺平 干饭 弹幕 打野 民宿 读档".split()
BOOST_F = 60
BLACKLIST = set("贝卡 千禧 州里 处里 连里 师里 来美 巴方 成飞 中唱 多抗 埃塞 韩币 金龙 金凤 金佛 伯斯 南珠 矿上 小卖 小个 上人 上操 下派 里带 里道 望塔 铃儿 挪挪 松枝 白鸽 白羽 白棋 古柏 左膝 马童".split())

def main():
    defaults = load_defaults()
    clover, clover_src = load_clover()
    cedict = load_cedict()
    subtlex, posmap = load_subtlex()

    def dom_pos(w):
        c = posmap.get(w)
        if not c:
            return ""
        return c.most_common(1)[0][0]

    def is_proper(w):
        c = posmap.get(w)
        if not c:
            return False
        prop = sum(v for k, v in c.items() if k in PROPER)
        return prop > 0 and prop >= sum(c.values()) * 0.6

    def bad_particle(w):
        return (w not in WHITELIST) and any(c in PARTICLE for c in w)

    pairs = [(subtlex[w], defaults[w]) for w in subtlex if w in defaults and subtlex[w] > 0]
    xs = [math.log10(a) for a, b in pairs]
    ys = [math.log10(b) for a, b in pairs]
    n = len(xs)
    mx = sum(xs) / n
    my = sum(ys) / n
    a = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
    b = my - a * mx

    def map_sx(c):
        if c <= 0:
            return 0
        return max(1, int(round(10 ** (a * math.log10(c) + b))))

    merged = dict(defaults)
    added = {}
    reasons = {}

    def add(w, f, why):
        f = max(5, min(300, f))
        if w in merged:
            return
        merged[w] = f
        added[w] = f
        reasons[w] = why

    for w in cedict:
        if w in defaults:
            continue
        if w in subtlex and dom_pos(w) in COMMON_POS and not is_proper(w) and not bad_particle(w):
            add(w, map_sx(subtlex[w]), "pos")
        else:
            add(w, 5, "rare")

    for w, c in subtlex.items():
        if w in defaults or w in added:
            continue
        if dom_pos(w) in COMMON_POS and not is_proper(w) and not bad_particle(w):
            add(w, map_sx(c), "subtlex")

    for w in clover:
        if w in defaults or w in added:
            continue
        if clover_src.get(w, "").startswith("THUOCL"):
            add(w, 5, "thuocl")

    for w in BOOST:
        if w in merged:
            if merged[w] < BOOST_F:
                merged[w] = BOOST_F
            if w in added:
                added[w] = merged[w]
            reasons[w] = "boost"
        else:
            add(w, BOOST_F, "boost")

    for w in BLACKLIST:
        if w in added:
            merged[w] = 5
            added[w] = 5
            reasons[w] = "black"

    with open(HERE + r"\_dicts\merged.tsv", "w", encoding="utf-8", newline="\n") as fh:
        for w, f in sorted(merged.items(), key=lambda kv: (-kv[1], kv[0])):
            fh.write(f"{w} {f}\n")

    print("defaults", len(defaults), "merged", len(merged), "added", len(added))
    print("reasons", collections.Counter(reasons.values()))
    bk = collections.Counter()
    for w, f in added.items():
        if f >= 100:
            bk[">=100"] += 1
        elif f >= 30:
            bk["30-99"] += 1
        elif f >= 10:
            bk["10-29"] += 1
        else:
            bk["5-9"] += 1
    print("added buckets", dict(bk))
    strict = sorted([w for w in added if added[w] >= 30], key=lambda w: -added[w])
    print("strict additions", len(strict))
    print(top_sample(" ".join(strict[:200])))

def top_sample(s):
    return "top-strict: " + s[:2000]

if __name__ == "__main__":
    main()