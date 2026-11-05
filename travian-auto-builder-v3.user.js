// ==UserScript==
// @name         Travian auto-builder v3 (daugiakaimis, rolės)
// @namespace    local.travian.autobuilder.v2
// @version      20.36
// @description  Kelia kaimus pagal rolę (resursų startas, sostinė, puolimo, resursų kaimai). Romėnams – lygiagrečiai laukas + pastatas. Renka užduočių atlygius, perkelia hero resursus, siunčia hero į nuotykius.
// @match        *://*.travian.com/dorf1.php*
// @match        *://*.travian.com/build.php*
// @match        *://*.travian.com/hero/*
// @match        *://*.travian.com/tasks*
// @match        *://*.travian.com/dorf2.php*
// @match        *://*.travian.com/statistics*
// @match        *://*.travian.com/report*
// @match        *://*.travian.com/karte.php*
// @match        *://*.travian.com/auctions/*
// @match        *://lobby.legends.travian.com/*
// @updateURL    https://raw.githubusercontent.com/llauriis/travian-skriptas/main/travian-auto-builder-v3.user.js
// @downloadURL  https://raw.githubusercontent.com/llauriis/travian-skriptas/main/travian-auto-builder-v3.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_listValues
// @grant        GM_deleteValue
// ==/UserScript==

(function () {
  'use strict';

  // ===== NUSTATYMAI =====
  const ROMAN = true;               // romėnai: laukas + pastatas vienu metu
  // Žmogiškas ritmas: darbo sesija → pertrauka (kartais ilgesnė); reakcijos laikas nevienodas (žr. humanDelay)
  const WORK = [70, 130];            // darbo sesijos trukmė, min.
  const BREAK = [5, 12];            // trumpa pertrauka, min.
  const LONG_BREAK_CHANCE = 0.06;   // tikimybė, kad pertrauka bus ilga
  const LONG_BREAK = [20, 40];      // ilga pertrauka, min.
  const ROUND_IDLE = 8;              // jei buvai dingęs ilgiau nei tiek min., prisėdęs apeini VISUS kaimus iš eilės
  const WANDER = true;              // kartais trumpam užsukti į kitą puslapį (centras, statistika, ataskaitos)
  const RETRY = [75, 150];          // kai trūksta resursų – tikrinti po 1–2,5 min.
  const VILLAGE_GAP = [8, 25];      // pauzė prieš persijungiant į kitą kaimą, sek.
  // Nakties pauzė: kiekvieną dieną kitas pradžios (~1:00–3:30) ir pabaigos (~6:00–8:30) laikas
  const RUSH_HOURS = 5;             // mygtukas „START 5 val.“: tiek valandų be nakties pauzės ir be pertraukų
  const MANUAL_AWAKE_H = [3, 5];
  const SHORT_NIGHT_H = 2;          // paspaudus START – nakties pauzė tik tiek valandų    // įjungus skriptą ranka, tiek valandų nakties pauzė netaikoma (sesija prasideda iškart)
  const NIGHT_STORE_H = 7.5;        // sandėlis turi tilpti tiek valandų gamybos (ilgiausia nakties pauzė + rytinis laukimas)
  const NIGHT_PAUSE = true;
  const NIGHT_WAKE = true;          // nakties pauzės viduryje – vienas trumpas „atsikėlimas“ (statybos + reidai)
  const NIGHT_WAKE_MIN = [25, 35];  // ilgiausias atsikėlimo langas (min.); baigiama anksčiau, kai viskas padaryta         // ~6 val. nakties pauzė (įjungus START mygtuką – nėra)
  const STORAGE_LIMIT = 0.9;        // sandėlis/svirnas >90 % pilnas – kelti jį be eilės
  const MAX_STORAGE_LEVEL = 20;
  const FAIL_LIMIT = 4;             // tiek kartų iš eilės žingsnis be jokio mygtuko → laikinai praleidžiamas
  const SKIP_HOURS = 6;

  // Kaimų rolės pagal įkūrimo eilę (mažiausias kaimo ID = pirmas kaimas).
  // 1: RESOURCE_START (resursinis, maitina 2 ir 3), 2: CAPITAL (15c/9c, Palace), 3: OFF (puolimo, ne sostinė), 4+: RESOURCE
  // 1 kaimas – karinis (ne sostinė, todėl tilps Great Barracks/Stable) + ekonomikos startas; 2 – sostinė (15c/9c); toliau – resursiniai
  // TAVO IMPERIJOS SCHEMA: 1 kaimas – OFF (plėšimo, EI), 2 – HAMMER (didžioji armija, Imperionai; sostinė 15c/9c),
  // 3, 4, 5… – RESURSINIAI (resursai keliauja į 1 ir 2, kultūros taškai, nedaug Pretorijonų gynybai)
  const ROLE_ORDER = ['RESOURCE_START', 'HAMMER', 'RESOURCE'];
  const MILITARY_ROLES = ['RESOURCE_START', 'HAMMER'];   // čia: plėšimai, oazės, žvalgai (abiejuose – kas turi EI, tas plėšia)
  const EI_TRAIN_ROLES = ['HAMMER'];                     // EI gaminami TIK čia (1 kaime – sustabdyta nuo 2026-11-03)
  const HAMMER_CAPITAL = true;      // HAMMER kaime Rūmai (sostinė): grūdų laukai virš 10, Rūmai 10 → 3 kaimas, Rūmai 15 → dar vienas
  const HAMMER_CROP_RATIO = 0.25;   // HAMMER kaime grūdų gamyba palaikoma ~25 % kitų žaliavų vidurkio
  const HAMMER_TRAIN = true;        // numatytas HAMMER kaimo režimas: true – AUTO (EI kaip 1 kaime; keičiama mygtuku „Kariai“)
  const HAMMER_SHARE = 0.30;        // HAMMER kaime vienu kartu Imperionams – iki tokios atsargų dalies
  const HAMMER_MAX_BATCH = 60;
  const PRAET_MAX = 750;            // resursiniame kaime – iki tiek Pretorijonų (gynybai)
  const PRAET_SHARE = 0.10, PRAET_FILL = 0.70;   // treniruojama tik kai sandėlis ≥70 % (perteklius), iki 10 % atsargų
  // Pakeisti ranka pagal kaimo ID (data-did), pvz. { '24368': 'RESOURCE_START', '24999': 'OFF' }
  const ROLE_OVERRIDE = {};

  // Užduotys ir hero
  const COLLECT_TASKS = true;
  const TASK_EVERY = [15, 25];      // min.
  const HERO_RESOURCES = true;
  const HERO_RES_EVERY = [20, 30];  // min.
  const HERO_RES_BELOW = 0.6;       // perkelti, jei kuri žaliava < 60 % talpos
  const HERO_ADVENTURES = true;
  const ADV_EVERY = [15, 25];       // min. tarp nuotykių tikrinimų
  const HERO_MIN_HEALTH = 20;       // į NUOTYKĮ nesiųsti, jei sveikata žemesnė (%) – hero ant jėgos, sunkus nuotykis kainuoja ~5 %
  // Hero taškai ir gamybos tipas
  const HERO_POINTS = true;         // automatiškai skirstyti nepanaudotus hero taškus
  const HERO_STR_MIN = 3;           // visada laikyti bent tiek taškų į strength
  const HERO_STR_EVERY = 8;         // kas kelintas bendras taškas – į strength (likę į resursus)
  const HERO_LOSS_MAX = 10;         // jei nuotykio sveikatos nuostolis didesnis (%), kitas taškas – į strength
  const HERO_AUTO_RES = true;       // automatiškai perjungti hero gamybos tipą į trūkstamiausią žaliavą (galima išjungti mygtuku puslapyje)
  const HERO_RES_SCARCE = 0.5;      // žaliava laikoma trūkstama, jei užpildo < 50 % talpos ir aiškiai atsilieka nuo kitų
  const HERO_RES_SWITCH_H = 2;      // gamybos tipą keisti ne dažniau kaip kas tiek val.
  const HERO_ATTR_EVERY = [40, 70]; // kas kiek min. peržiūrėti hero atributus
  // ===== HEROJUS: KOVA IR OAZĖS =====
  const HERO_FIGHT = true;          // true = visi nauji hero taškai į strength (kovos kelias); false = senoji taisyklė (resursai)
  // Oazių režimas jungiamas mygtuku puslapyje: IŠJUNGTOS → BANDYMAS (tik parašo, kur siųstų) → ĮJUNGTOS (siunčia)
  const OASIS_EVERY = [3, 7];
  const LANE_SPLIT = 0.60;            // sandėlis ≥60 % – pirmenybė pastatams mieste, mažiau – laukams        // kas kiek min. ieškoti oazės (kai herojus namie)
  const OASIS_FIRST = false;        // false: pirma nuotykiai (kol yra), paskui oazės; true: pirma oazės, nuotykis – tik jei tinkamos oazės nėra
  const ALTERNATE = true;           // nuotykis → oazė → nuotykis → oazė ... kol baigiasi nuotykiai, paskui tik oazės (jei vieno iš jų nėra – imamas kitas)
  const oasisTurn = () => ALTERNATE ? GM_getValue('lastTrip', '') === 'adv' : OASIS_FIRST;
  const HEALTH_FRESH_MIN = 15;
  const HOLD_HERO_OASIS_MIN = 90;   // ateina puolimas per tiek min. – į oazes herojaus nesiųsti (gins kaimą)
  const HOLD_HERO_ADV_MIN = 240;    // ...į nuotykius – per tiek min.      // sveikatą prieš oazę perskaityti iš naujo, jei senesnė nei tiek min.
  const OASIS_MAX_LOSS = 80;        // didžiausias leistinas prognozuojamas sveikatos nuostolis (taškais)
  const OASIS_MIN_HEALTH = 25;      // nesiųsti, jei sveikata mažesnė (prognozė vis tiek turi palikti ≥ OASIS_KEEP_HEALTH)
  const OASIS_KEEP_HEALTH = 20;     // po kovos turi likti bent tiek sveikatos (prognozuojant – su atsarga nuo mirties)
  // Karžygio nustatymai (langas „Karžygys“, GM heroCfg) – numatytieji iš konstantų aukščiau
  const hc = () => ({ oasisMin: OASIS_MIN_HEALTH, oasisKeep: OASIS_KEEP_HEALTH, oasisMaxLoss: OASIS_MAX_LOSS, advMin: HERO_MIN_HEALTH, clear: HERO_CLEAR, adv: HERO_ADVENTURES, defHelp: true, hpValue: HERO_HP_VALUE, ...(jget('heroCfg', {}) || {}) });
  const OINTMENT_BELOW = 40;        // sveikata žemiau – naudoti tepalus (po ≤ OINTMENT_MAX_USE), kad herojus galėtų vėl pulti oazę
  const OINTMENT_MAX_USE = 10;      // tepalų vienu kartu – ne daugiau (kad herojus greitai vėl eitų į oazę)
  const OINTMENT_TO = 85;           // tepalai: kai sveikata per maža oazėms – pagydyti iki tiek % (1 tepalas = 1 %)
  const OASIS_SAFETY = 1.2;         // atsarga gynybai (gyvūnų gynyba dauginama iš šio skaičiaus)
  const OASIS_MAX_DIST = 25;
  const EI_ATTACK = 120;            // Imperatoriaus raitelio puolimas (be kalvės patobulinimų)
  const OASIS_EI_MAX = 30;
  // HEROJUS + ARMIJA: į oazę su gyvūnais kartu eina ir pėstininkai (bei visi EI), jei kova neišeina į minusą:
  // premija už nukautus gyvūnus (~OASIS_BONUS_PER_UP resursų už 1 gyvūno išlaikymo vnt., iš tavo ataskaitos: 9 vnt. → 1 440) ≥ žuvusių karių kaina
  const OASIS_ARMY = true, OASIS_BONUS_PER_UP = 160, ARMY_MAX_MIN = 20, ARMY_NOHERO_MIN = 50, OASIS_STOCK_GUESS = 400;   // pėstininkai į oazes – iki 20 min. kelio
  const UNIT_ATT_R = { t1: 40, t3: 70, t5: 120 }, UNIT_COST_R = { t1: 400, t3: 600, t5: 1410 };          // daugiausia EI kartu su herojumi
  const HERO_MOUNTED = true;        // herojus su žirgu – kovoje skaičiuojamas kaip raitelis
  const HERO_HP_VALUE = 1000;       // 1 % herojaus sveikatos vertė resursais (renkantis, kiek EI siųsti su herojumi; keičiama lange „Karžygys“)
  const OASIS_EI_MAX_DEATHS = 1;    // pirmenybė – kad nežūtų nė vienas; 1 leidžiamas tik jei kitaip oazės nepulsim        // toliausias atstumas, kurį verta ieškoti (laukeliais)
  const OASIS_DETAILS_PER_SCAN = 25;     // kiek oazių su gyvūnais vienu skenavimu patikrinti išsamiai
  const OASIS_WINDOWS_PER_SCAN = 5;      // kiek žemėlapio langų vienu skenavimu
  const OASIS_NEXT_WIN = [1, 3];
  const OASIS_EMPTY_WAIT = [40, 70];   // apėjus visą zoną ir neradus – kitas ratas tik po tiek min.         // nieko neradus – po tiek min. tikrinami kiti (tolimesni) langai
  const OASIS_MIN_XP = 1;           // per menka oazė (gyvūnų išlaikymo suma, pvz. 1 žiurkė = 1) – nevaikščioti; tiek pat ~ XP ir grobio // kiek artimiausių oazių detaliai apžiūrėti per kartą
  const OASIS_RESPECT_PROTECTION = false;  // patikrinta: laisvos oazės puolimas pradedančiojo apsaugos nenutraukia
  // Narvai (jungiklis „Narvai“): gaudyti tik stipriausius gyvūnus – oazė turi būti sudaryta TIK iš šių rūšių
  const CAGE_ANIMALS = ['u36', 'u37', 'u38', 'u39', 'u40'];   // top 5: vilkas, lokys, krokodilas, tigras, dramblys
  // Patikrinta žaidime: narvai gaudo nuo SILPNIAUSIŲ (u31 → u40). Todėl mišri oazė tinka, jei silpnų mažai:
  const CAGE_WEAK_MAX = 3;          // kiek daugiausia silpnų gyvūnų (ne iš CAGE_ANIMALS) gali „suvalgyti“ narvus
  const CAGE_MIN_STRONG = 2;        // kiek bent stiprių turi būti sugauta, kad verta
  // Gyvūnų gynyba [prieš pėstininkus, prieš raitelius] ir išlaikymas (XP ~ išlaikymas). Voras patikrintas žaidimo simuliatoriumi.
  const ANIMALS = {
    u31: { n: 'žiurkė',    d: [25, 20],   up: 1 }, u32: { n: 'voras',   d: [35, 40],   up: 1 },
    u33: { n: 'gyvatė',    d: [40, 60],   up: 1 }, u34: { n: 'šikšnosparnis', d: [66, 50], up: 1 },
    u35: { n: 'šernas',    d: [70, 33],   up: 2 }, u36: { n: 'vilkas',  d: [80, 70],   up: 2 },
    u37: { n: 'lokys',     d: [140, 200], up: 3 }, u38: { n: 'krokodilas', d: [380, 240], up: 3 },
    u39: { n: 'tigras',    d: [170, 250], up: 3 }, u40: { n: 'dramblys', d: [440, 520], up: 5 },
  };

  // ===== NAUJA PASKYRA / LENKTYNĖS DĖL 2 KAIMO =====
  // RACE_MODE = true: laukai neaplenkia gido (TraviTools x2) – resursai eina kultūros taškams, rezidencijai ir įsikūrėjams.
  // EARLY_RESIDENCE = false: rezidencija 10 – gido vietoje (po rotušės ir švenčių), ne iš karto.
  const SKIP_CROP_FIELDS = true;     // pradžioje grūdų laukai nekeliami (resursai – kitiems laukams); išjungti ranka, kai norėsi (išimtis: laisvi grūdai < FREE_CROP_MIN)
  const RACE_MODE = true;
  const RACE_FIELD_AHEAD = 4;   // kiek neįvykdytų pastatų žingsnių laukų eilė gali „aplenkti“ (0 = laukai tik iki pirmo neįvykdyto pastato)
  const EARLY_RESIDENCE = false;

  // ===== PLĖTIMASIS =====
  const EARLY_FIELDS_UNTIL = 9;     // naujame kaime: kol laukai (be grūdų) vidutiniškai < 9 – pastatai tik iki 5 lygio (Gyvenamasis iki 10)
  const EARLY_BLD_MAX = 5;
  const EXPANSION_MAX_LVL = 10;     // Rezidencija ir Rūmai keliami tik iki 10 (kol nepaprašysi daugiau)
  const SETTLE_FOCUS = true;
  const SETTLE_FOCUS_FIELDS = 6;    // fokusas prasideda, kai laukai (be grūdų) vidutiniškai pasiekia šį lygį        // kol nėra 2 kaimo: keliama tik Rezidencija iki 10, tada 3 įsikūrėjai; visa kita – stop
  const SETTLERS = true;            // rezidencija 10 → 3 įsikūrėjai (treniruojami, kai įmanoma; prieš tai taupoma)
  const SETTLER_SAVE_H = 48;        // pradėti taupyti įsikūrėjams, kai kultūros taškų pakaks per tiek valandų
  const SITE_SCAN_EVERY = [60, 120];  // kas kiek min. ieškoti vietų naujam kaimui
  // ===== PLĖŠIKAVIMAS =====
  const RAIDS = true;               // siųsti Equites Imperatoris į neaktyvius kaimus (iš fermų sąrašo)
  const RAID_EVERY = [8, 16];       // kas kiek min. bandyti siųsti naują plėšimą
  const RAID_MAX_DIST = 25;         // laukeliai
  const RAID_MIN_EI = 3, RAID_MAX_EI = 15;
  const RAID_MIN_POP = 5;          // ir labai maži (mesti startai) – jei gyventojų skaičius nekinta
  const RAID_PROFIT_RATIO = 2;
  const INF_MIN = 3, INF_MAX = 120;  // pėstininkų (Imperionų/legionierių) reidas į žaidėjo kaimą: nuo–iki
  const INF_MAX_DIST = 12;          // tik artimi kaimai (pėstininkai lėti: ~50 min. į vieną pusę)
  const HERO_CLEAR = true;          // herojus visada eina į „valymo“ puolimus (jei namie ir sveikatos pakanka)
  const SCOUT_FIRST = true;         // į žaidėjų kaimus – tik po žvalgybos
  const ALLY_INTEL = true, ALLY_REP_EVERY = [20, 40], ALLY_REP_PAGES = 15;   // aljanso „Užpuolimai“: kas 20–40 min., iki 15 puslapių   // skaityti aljanso „Užpuolimai“ kas 30–60 min.
  const CLEAR_MAX_EI = 100;         // „numušti defą“ puolimui – iki tiek EI
  const CLEAR_SAFETY = 1.3;         // gynybos atsarga (siena, kalvės patobulinimai, netikslios vienetų reikšmės)
  const CLEAR_MAX_DEATHS = 3;       // jei be nuostolių neišeina – siunčiami visi EI, jei žūtų ne daugiau kaip tiek      // reidas su nuostoliais laikomas geru, jei grobis ≥ 2× prarastų karių vertė
  const AUTO_LEGIONS = false;       // legionierius ruoši pats – skriptas jų netreniruoja
  const SCOUTS_WANT = 5;
  const SCOUTS_COUNT_OUT = false;    // false – kol žvalgai žvalgo, namie gaminami nauji (iš viso ~5 + tiek, kiek jų vienu metu išėję)            // kiek žvalgų laikyti
  const BONUS_TO_NEW = true;        // užduočių bendrieji atlygiai ir herojaus kuprinės resursai – tik į NAUJAUSIĄ kaimą
  const SUPPLY = true;              // 1 kaimas papildo kitus kaimus, kol jų laukai < 10
  const SUPPLY_BELOW = 0.50, SUPPLY_TARGET = 0.85;   // kitame kaime žaliavos < 50 % sandėlio → papildyti iki ~85 % (niekada virš talpos)
  const SUPPLY_KEEP = 0.35;         // 1 kaime visada palikti ≥35 % sandėlio (EI ir statyboms)
  // LAUKŲ SPURTAS: kaime jau yra lentpjūvė/plytinė/liejykla, o medienos/molio/geležies laukai dar ne visi 10 → VISI kiti kaimai siunčia resursus
  const SUPPLY_PUSH = true, PUSH_BELOW = 0.50, PUSH_TARGET = 0.50;   // spurto kaimą pildyti, kai žaliava (ir grūdai) < 50 % talpos, iki 50 %
  const PUSH_KEEP = 0, PUSH_KEEP_CROP = 0.10;   // rėmėjas spurtui gali atiduoti VISKĄ, išskyrus 10 % klėties grūdų
  const PUSH_DONOR_AVG = 8;         // remti spurtą gali tik kaimas, kurio medienos/molio/geležies laukai vidutiniškai ≥ 8   // spurto kaimą pildyti, kai žaliavos < 80 % sandėlio, iki ~95 %
  const SUPPLY_MIN = 300, SUPPLY_EVERY = [20, 40];   // siųsti bent 300 (naujo kaimo sandėlis tik 800), kas 20–40 min.
  const EI_TRAIN_SHARE = 0.12;
  const EI_RUSH_H = 12, EI_RUSH_SHARE = 0.6;
  const RUSH_CROP_FC = 60;          // EI kepimo metu: grūdų balansas < 60/val. (≈20 EI) → kelti grūdų lauką   // įkūrus 2 kaimą: 12 val. 1 kaime tik EI (iki 60 % atsargų vienu kartu)      // arklidėse – iki tokios atsargų dalies vienu kartu
  // ===== GYNYBA =====
  const DUMP = true;                // artėjant puolimui – resursai virš slėptuvės paverčiami kariais (ir NPC, jei reikia)
  const DUMP_AT_MIN = 12;           // likus tiek min. iki puolimo
  const DUMP_MIN_OVER = 1500;       // gelbėti, jei virš slėptuvės ≥ tiek resursų
  const DUMP_SEND_MIN = 500;        // likutį virš slėptuvės siųsti į kitą savo kaimą, jei ≥ tiek
  const DUMP_NPC_MIN = 1500;        // NPC (3 auksai) – tik jei po treniravimo virš slėptuvės liko ≥ tiek
  const DUMP_MAX_UNITS = 200;
  const DODGE = true;               // prieš atvykstant puolimui išvesti EI ir žvalgus į tuščią oazę (grįš patys)
  const DODGE_SEC = 150;            // kiek sekundžių prieš atvykimą

  // ===== RESURSŲ LYGINIMAS =====
  const MARKET_TRADE = true;        // turguje skelbti 1:1 pasiūlymus: perteklius → trūkstama žaliava
  const MARKET_HIGH = 0.85;         // perteklius, jei užpildyta ≥85 %
  const MARKET_LOW = 0.40;          // trūksta, jei <40 %
  const MARKET_EVERY = [90, 150];   // kas kiek min. daugiausia vienas pasiūlymas
  const EMPTY_OASIS_RAID = true;     // plėšti tuščias laisvas oazes kariais (legionieriais, vėliau EI)
  const EO_MIN_TROOPS = 2, EO_GROUP = 4;   // (dvigubai: oazės grįžta pilnais maišais)   // į vieną tuščią oazę – po 3 (likę 2 – irgi siunčiami); kiti kariai – į kitas oazes
  const EO_MAX_DIST = 10;
  const FARM_LIST_MODE = true;       // Aukso klubas: tuščios oazės per „Fermų“ sąrašą „Tuscios oazes“
  const FL_NAME = /Tuscios oazes|Tuščios oazės/i;
  const EI_IDLE_OASES = true;       // laisvi EI (nėra žaidėjų fermų) – tolimesnės tuščios oazės
  const FL_USE_EI = false;          // EI tuščių oazių nepuola – jie skirti žaidėjų kaimams
  const FL_LEG = { t1: 4 };          // į kiekvieną oazę – 2 legionieriai (neša 100)
  const FL_EI = { t5: 4 };           // kai namie yra Imperatoriaus raitelių – po 2 EI (neša 200)
  const FL_MAX_MIN = 50;             // legionieriai: tik oazės, iki kurių eina ≤50 min.
  const FL_MAX_MIN_EI = 40;          // Imperatoriaus raiteliai: ≤40 min.
  // karių greičio daugiklis pagal serverį: x3 – išmatuota (legionierius 5 lauk. = 25 min → ×2); kitiems – spėjimas, patikrinti pirmu reidu
  const TROOP_SPEED = ({ 1: 1, 2: 2, 3: 2, 5: 3, 10: 4 })[+((location.hostname.match(/\.x(\d+)\./) || [])[1] || 1)] || 1;
  const FL_SPEED_LEG = 6 * TROOP_SPEED, FL_SPEED_EI = 14 * TROOP_SPEED;   // laukeliai per valandą
  const FL_PARTIAL_COOLDOWN_H = 2;   // paskutinis reidas ne pilnu maišu → tos oazės nepulti tiek valandų
  const FL_MAX_SLOTS = 60;           // kiek daugiausia oazių laikyti sąraše
  const FL_SIZE_MAX = 40;           // pilnu maišu grįžus – grupė į tą oazę auga ×1,5 (iki tiek); menkas grobis – mažėja
  const FL_EVERY = [5, 9];           // kas kiek min. tikrinti: grįžę kariai (≥2) iškart vėl išsiunčiami, nelaukiant visų           // tik artimos – kitaip kiti aplenkia
  const EO_EVERY = [6, 12];         // kas kiek min. tikrinti, ar kariai namie
  const EO_COOLDOWN = [80, 140];    // tos pačios oazės nepulti dažniau (min.)
  const EO_COOLDOWN_FULL = [50, 80];   // praeitą kartą pilnas maišas – grįžtam greičiau
    const EO_GROUP_MAX = 24;           // EI į vieną oazę daugiausia (auga po +1, kai praeitas maišas pilnas)
  const EO_COOLDOWN_POOR = [150, 240];   // praeitą kartą < 30 % maišo – oazę plėšia kiti, rečiau
  const EI_FAR_MAX_MIN = 45;        // laisvi EI – oazės iki tiek minučių kelio į vieną pusę (~1,5 val. su grįžimu)
  const EI_FAR_EXT_MIN = 75;        // tik kai visos oazės iki EI_FAR_MAX_MIN jau plėštos, o EI liko – iki tiek min. (~2,5 val. su grįžimu)
  const EI_FAR_SCAN_MIN = 90;       // tolimų oazių žemėlapį perskenuoti ne dažniau (min.)
  const EI_CLEAR_WEAK = true;       // EI išvalo silpnas oazes (keli žvėreliai), jei prognozė – 0 žuvusių
  const EI_CLEAR_WEAK_MAX = 15;     // daugiausia EI tokiam valymui
  const MARKET_CROP_RATIO = 1.0;    // bendri 1:1 mainai (perteklius → trūkumas)
  const CROP_BUY_BELOW = 0.15;      // grūdų < 15 % klėties – pirkti grūdus turguje
  const CROP_BUY_TO = 0.50;         // pirkti, kol grūdų bus ~50 % klėties
  const CROP_RATIO_FREE = 2.0;      // po naujoko apsaugos: už 1000 žaliavos – 2000 grūdų (ir perkant, ir siūlant); apsaugoje tik 1:1
  const CROP_BUY_AMT = 1000;        // savas pasiūlymas: 1000 žaliavos už 1000 grūdų
  const CROP_BUY_MIN_GIVE = 500;    // pirkimui turėti bent tiek kurios nors žaliavos
  const CROP_BUY_MAX_MIN = 45;      // priimti pasiūlymą, tik jei prekeiviai atveža per ≤45 min.
  const CROP_BUY_EVERY = [30, 50];  // ne dažniau kaip kas tiek min. (kad nesikrautų daug pasiūlymų)
  const MARKET_MERCHANTS = 2;       // kiek pirklių panaudoti vienam pasiūlymui
  const NPC_TRADE = true;           // NPC mainai už auksą (3 auksai): TIK kai geležis IR grūdai beveik pilni
  const NPC_FULL = 0.90;            // „beveik pilni“
  const NPC_KEEP = 0;               // po mainų pasilikti tiek geležies ir grūdų (talpos dalis); 0 = viską į medieną ir molį
  const NPC_MAX_PER_DAY = 3;        // daugiausia NPC mainų per parą
  const NPC_MAX_GOLD = 3;           // jei kaina didesnė – nekeisti

  // ===== FERMŲ STEBĖJIMAS =====
  const FARM_WATCH = true;          // užrašinėti aplinkinių kaimų gyventojus ir žymėti neaktyvius
  const FARM_EVERY = [150, 240];    // kas kiek min. peržiūrėti aplinką
  const FARM_RADIUS = 1;            // 1 = 3×3 žemėlapio langai aplink kaimą (~33×27 laukelių)
  const FARM_INACTIVE_H = 24;       // tiek valandų neaugo – „galbūt neaktyvus“; dvigubai – „neaktyvus“

  // ===== KARIAI =====
  // Jungiama mygtuku „Kariai“. Treniruoja tik iš pertekliaus, kad kaimo augimas nesustotų.
  const TRAIN_START_POP = 100;      // pradėti, kai kaimo gyventojų ne mažiau
  const TRAIN_UNIT = 't1';          // t1 = legionierius (kareivinėse)
  const TRAIN_SHARE = 0.10;         // vienu kartu išleisti ne daugiau kaip tokią dalį esamų atsargų
  const TRAIN_EVERY = [60, 90];     // kas kiek min.
  const TRAIN_MAX_BATCH = 10;       // daugiausia vienetų vienu kartu

  // Reklamos statybos pagreitinimas („Construct 25% faster“) – jungiklis puslapyje; veikia tik kai tu sėdi prie ekrano
  const VIDEO_BOOST = true;
  const PROD_VIDEO = true;          // reklama „+15 % gamyba 8 val.“ kiekvienai žaliavai (tik violetiniai video mygtukai; auksiniai – niekada)
  const AUTO_RELOGIN = true;        // išmetus į lobby – pats paspaudžia „Žaisti dabar“ (tik jei dar prisijungęs prie lobby; slaptažodžio niekada neveda)
  const GAME_WORLD = '';            // pasaulio pavadinimo dalis lobby kortelėje; tuščia = paskutinis žaistas serveris (nustatoma automatiškai)
  const ADV_HARD = true;            // reklama „sunkesnis nuotykis“ (daugiau XP ir resursų, bet didesnis sveikatos nuostolis)
  const ADV_HARD_MIN_HEALTH = 25;   // sunkesnis nuotykis – nebent sveikata < 25 % (į nuotykį vis tiek siunčiama tik nuo hc().advMin)
  const VIDEO_MIN_SEC = 20 * 60;    // naudoti tik statyboms, kurios trunka ilgiau nei 20 min.
  const VIDEO_WAIT = [38, 50];      // kiek sekundžių laukti, kol reklama baigsis (trunka ~30 s)

  // Pastatai: gid = žaidimo kodas, cat = kategorijos skirtukas, slot = fiksuota vieta
  const B = {
    SAWMILL:      { gid: 5,  cat: 3 },
    BRICKYARD:    { gid: 6,  cat: 3 },
    IRON_FOUNDRY: { gid: 7,  cat: 3 },
    GRAIN_MILL:   { gid: 8,  cat: 3 },
    BAKERY:       { gid: 9,  cat: 3 },
    WAREHOUSE:    { gid: 10, cat: 1 },
    GRANARY:      { gid: 11, cat: 1 },
    SMITHY:       { gid: 13, cat: 2 },
    MAIN:         { gid: 15, cat: 1 },
    RALLY:        { gid: 16, cat: 2, slot: 39 },
    MARKET:       { gid: 17, cat: 1 },
    EMBASSY:      { gid: 18, cat: 1 },
    BARRACKS:     { gid: 19, cat: 2 },
    STABLE:       { gid: 20, cat: 2 },
    ACADEMY:      { gid: 22, cat: 2 },
    TOWN_HALL:    { gid: 24, cat: 1 },
    RESIDENCE:    { gid: 25, cat: 1 },
    PALACE:       { gid: 26, cat: 1 },
    TRADE_OFFICE: { gid: 28, cat: 1 },
    WALL:         { gid: 31, cat: 2, slot: 40 },
    CRANNY:       { gid: 23, cat: 1 },
    WORKSHOP:     { gid: 21, cat: 2 },
    HORSE_TROUGH: { gid: 41, cat: 2 },   // romėnų arklių girdykla
  };
  // 1 lygio kaina (mediena, molis, geležis, grūdai) ir daugiklis lygiui – „pigaus užpildo“ palyginimui su laukiamu pastatu
  const BCOST = {
    1: [[40, 100, 50, 60], 1.67], 2: [[80, 40, 80, 50], 1.67], 3: [[100, 80, 30, 60], 1.67], 4: [[70, 90, 70, 20], 1.67],   // laukai (rezervui kariams)
    5: [[520, 380, 290, 90], 1.8], 6: [[440, 480, 320, 50], 1.8], 7: [[200, 450, 510, 120], 1.8], 8: [[500, 440, 380, 1240], 1.8], 9: [[1200, 1480, 870, 1600], 1.8],
    10: [[130, 160, 90, 40], 1.28], 11: [[80, 100, 70, 20], 1.28], 13: [[170, 200, 380, 130], 1.28], 15: [[70, 40, 60, 20], 1.28],
    16: [[110, 160, 90, 70], 1.28], 17: [[80, 70, 120, 70], 1.28], 18: [[180, 130, 150, 80], 1.28], 19: [[210, 140, 260, 120], 1.28],
    20: [[260, 140, 220, 100], 1.28], 22: [[220, 160, 90, 40], 1.28], 23: [[40, 50, 30, 10], 1.28], 24: [[1250, 1110, 1260, 600], 1.28],
    25: [[580, 460, 350, 180], 1.28], 26: [[550, 800, 750, 250], 1.28], 31: [[70, 90, 170, 70], 1.28],
  };
  const bCost = (gid, lvl) => { const c = BCOST[gid]; return c ? c[0].map(v => Math.round(v * Math.pow(c[1], Math.max(0, lvl - 1)) / 5) * 5) : null; };
  // PIGUS UŽPILDAS: kol laukiama resursų plano pastatui (pvz. Valdovų rūmams), pastatų linija nestovi – keliamas pastatas, kurio
  // vėliau vis tiek reikės pagal planą, jei jo kaina ≤ CHEAP_FILL_SHARE laukiamo pastato kainos; iš viso ≤ CHEAP_FILL_TOTAL vienam laukimui
  const CHEAP_FILL = true;
  const CHEAP_FILL_SHARE = 0.15;
  const CHEAP_FILL_TOTAL = 0.30;
  const CRANNY_N = { HAMMER: 2, RESOURCE: 4 };   // kiek slėptuvių (kiekviena iki 10) – kol užtenka vietos; trūkstant vietos – griaunamos
  const CHEAP_NEW = { 23: [], 19: [[15, 3], [16, 1]], 22: [[19, 3], [15, 3]], 13: [[15, 3], [22, 1]] };   // nauji: slėptuvė, kareivinės, akademija, kalvė – su reikalavimais

  // ---------- PLANAI ----------
  // {f:n} = laukai iki lygio n; papildomai: order:[gid...] pirmenybė, only:[gid...] tik tie laukai, count:k – pakanka k laukų
  // {b:'RAKTAS', l:n} = pastatas iki lygio n. Žingsniai vykdomi iš eilės; neįmanomi žingsniai laikinai praleidžiami.
  // laukų gid: 1 mediena, 2 molis, 3 geležis, 4 grūdai.

  // 1 kaimas: resursinis. Greitas startas antram kaimui (Residence 10), paskui pilnas resursinis kaimas.
  const CROP_RATIO = 0.7;            // pirmame kaime grūdų gamyba ≈ 70 % kitų žaliavų vidurkio (t. y. 30 % mažesnė)
  const FIELD_PROD = [3, 7, 13, 21, 31, 46, 70, 98, 140, 203, 280, 390, 525, 700, 925, 1210, 1580, 2060, 2680, 3480, 4520];   // lauko gamyba pagal lygį (santykiui; patikrinta: 5 lygis = 46)
  const FREE_CROP_MIN = 10;
  const WAR_CROP_MIN = 30;           // karo režime: laisvų grūdų < tiek/val. – keliami grūdų laukai (kitos statybos – ne)
  // Užpildas: kai plano pastatui trūksta resursų, pastatų eilė nestovi – keliamas pigus esamas pastatas (gyventojai ir kultūros taškai)
  const FILLER = true;
  const FILLER_GIDS = [23, 16, 17, 22, 19, 11, 10, 15, 31, 13, 8];   // (ambasada – tik 1 lygis, ne užpildui) slėptuvė, susib. vieta, turgus, akademija, kareivinės, svirnas, sandėlis, pagr. pastatas, siena, kalvė, malūnas
  const MAIN_OVER_FIELDS = 3;       // užpildas: Gyvenamasis ne aukščiau nei vidutinis laukų lygis + 3 (laukai 5 → iki 8)
  const MAIN_FILL_MAX = 15;          // Gyvenamasis pastatas kaip užpildas – iki šio lygio (pirmiausia už kitus užpildus)
  const MARKET_MAX = 15;            // turgus visuose kaimuose – iki 15 (plane ir kaip užpildas, kai nėra ką statyti)
  const RES_MAIN_MAX = 10;          // fermų (RESOURCE: 3-as, 4-as… kaimas) Gyvenamasis pastatas – ne aukščiau
  const MAIN_MAX = 15;              // 1-as ir 2-as kaimas (Krapštaliukai, 1c) – Gyvenamasis ne aukščiau
  const mainMax = () => ROLE === 'RESOURCE' ? RES_MAIN_MAX : MAIN_MAX;
  const FILLER_MAX_LVL = 10;        // tik iki tokio lygio (pigūs)          // jei laisvų grūdų (+/val.) mažiau – skubiai kelti grūdų lauką, nepaisant plano
  // Bendra pirmo kaimo dalis po 2 kaimo (Unofficial Travian „Developing your first villages“ + karinis kaimas)
  const POST_SETTLE = [
    { f: 5 },
    { f: 6 }, { b: 'GRAIN_MILL', l: 2 }, { b: 'MAIN', l: 14 },
    { f: 7 }, { b: 'GRAIN_MILL', l: 3 },
    { f: 8, only: [2] }, { f: 8, only: [1] }, { f: 8, only: [4] }, { f: 8, only: [3] },
    { b: 'WAREHOUSE', l: 12 }, { b: 'GRANARY', l: 12 },
    { b: 'MARKET', l: 10 }, { b: 'WALL', l: 10 },
    { f: 10, only: [1], count: 1 }, { f: 10, only: [2], count: 1 }, { f: 10, only: [3], count: 1 }, { f: 10, only: [4], count: 1 },
    { b: 'SAWMILL', l: 3, gate: [1] }, { b: 'BRICKYARD', l: 3, gate: [2] }, { b: 'IRON_FOUNDRY', l: 3, gate: [3] }, { b: 'GRAIN_MILL', l: 5 }, { b: 'BAKERY', l: 3, gate: [1, 2, 3] },
    { f: 9 },
    { b: 'MAIN', l: 20 },
    { f: 10 },
    { b: 'SAWMILL', l: 5, gate: [1] }, { b: 'BRICKYARD', l: 5, gate: [2] }, { b: 'IRON_FOUNDRY', l: 5, gate: [3] }, { b: 'BAKERY', l: 5, gate: [1, 2, 3] },
    { b: 'MARKET', l: 15 }, { b: 'STABLE', l: 10 },
    // karinis kaimas: raitelių bazė
    { b: 'SMITHY', l: 10 }, { b: 'RALLY', l: 10 }, { b: 'STABLE', l: 20 }, { b: 'HORSE_TROUGH', l: 10 }, { b: 'ACADEMY', l: 15 }, { b: 'HORSE_TROUGH', l: 20 },
    { b: 'WAREHOUSE', l: 20 }, { b: 'GRANARY', l: 20 }, { b: 'WALL', l: 20 }, { b: 'RALLY', l: 20 }, { b: 'ACADEMY', l: 20 },
    { b: 'TOWN_HALL', l: 10 }, { b: 'BARRACKS', l: 10 }, { b: 'SMITHY', l: 10 },
  ];

  // 1 kaimas (romėnai, x2) – pagal TraviTools „Fast Second Village“ (x2, romėnai, plėšikas) iki 2 kaimo,
  // toliau – pagal Unofficial Travian „Developing your first villages“ (pirmo kaimo žingsniai po 2 kaimo).
  // Laukų eilė eina atskirai (romėnai stato lauką ir pastatą vienu metu), todėl laukai kyla visada.
  const PLAN_START_X2 = [
    // --- TraviTools x2 (romėnai) ---
    { f: 2, only: [2], count: 1 }, { f: 2, only: [3], count: 1 },
    { b: 'EMBASSY', l: 1 }, { b: 'WAREHOUSE', l: 1 }, { b: 'GRANARY', l: 1 }, { b: 'MAIN', l: 3 },
    { b: 'WALL', l: 3 }, { b: 'MARKET', l: 3 }, { b: 'CRANNY', l: 3 },
    { f: 2, only: [3] }, { f: 2, only: [2] }, { f: 2, only: [1] }, { f: 2, only: [4] },
    { f: 4, only: [1], count: 1 }, { f: 4, only: [2], count: 1 }, { f: 4, only: [3], count: 1 }, { f: 4, only: [4], count: 1 },
    { b: 'BARRACKS', l: 1 }, { b: 'MAIN', l: 7 }, { b: 'WAREHOUSE', l: 3 }, { b: 'GRANARY', l: 3 },
    { f: 3, only: [2] }, { f: 3, only: [1] }, { f: 3, only: [3] },
    { b: 'BARRACKS', l: 3 }, { f: 3, only: [4] },
    { b: 'RESIDENCE', l: 10, early: true }, // išimtis šiai paskyrai (EARLY_RESIDENCE): KT pakanka greitai
    { b: 'ACADEMY', l: 1 }, { b: 'CRANNY', l: 10 }, { b: 'MARKET', l: 7 },
    { b: 'SMITHY', l: 3 }, { b: 'ACADEMY', l: 5 }, { b: 'STABLE', l: 1 }, { b: 'STABLE', l: 3 }, { b: 'RESIDENCE', l: 1 },
    { b: 'STABLE', l: 5 },                 // romėnų Equites Imperatoris reikalauja arklidžių 5 (žaidimo aprašymas)
    // (tyrimai ir raiteliai – automatiškai, žr. RESEARCH / trainChore)
    { b: 'ACADEMY', l: 10 }, { b: 'WORKSHOP', l: 1 }, { b: 'MAIN', l: 10 }, { b: 'TOWN_HALL', l: 1 },
    { b: 'GRANARY', l: 7 }, { b: 'WAREHOUSE', l: 8 },
    { b: 'MAIN', l: 12 }, { b: 'RESIDENCE', l: 3 }, { b: 'RESIDENCE', l: 7 }, { b: 'RESIDENCE', l: 10 },
    // (3 įsikūrėjai – automatiškai, kai rezidencija 10; 2 kaimą įkuri pats)
    ...POST_SETTLE,
  ];
  // x3 – TraviTools „Resource production · speed start“ (vienintelis x3 variantas: be plėšimų, herojaus taškai į gamybą)
  const PLAN_START_X3 = [
    { f: 2, only: [1], count: 1 }, { f: 2, only: [2], count: 1 }, { f: 2, only: [3], count: 1 }, { f: 2, only: [4], count: 1 },
    { b: 'WAREHOUSE', l: 1 }, { b: 'GRANARY', l: 1 }, { b: 'EMBASSY', l: 1 }, { b: 'CRANNY', l: 3 },
    { b: 'MAIN', l: 3 }, { b: 'WALL', l: 3 }, { b: 'MARKET', l: 3 },
    { f: 2, only: [4] }, { f: 2, only: [1] }, { f: 2, only: [2] }, { f: 2, only: [3] },
    { f: 4, only: [4], count: 1 }, { f: 4, only: [1], count: 1 }, { f: 4, only: [2], count: 1 }, { f: 4, only: [3], count: 1 },
    { b: 'BARRACKS', l: 1 }, { b: 'MAIN', l: 7 }, { b: 'WAREHOUSE', l: 3 }, { b: 'GRANARY', l: 3 },
    { f: 3, only: [1] }, { f: 3, only: [3] }, { f: 3, only: [2] },
    { b: 'BARRACKS', l: 3 }, { b: 'ACADEMY', l: 1 }, { f: 3, only: [4] },
    { f: 5 },                                   // laukų linija neturi stovėti: miškas/molis/geležis iki 5 (grūdai – pagal SKIP_CROP_FIELDS)
    { b: 'RESIDENCE', l: 1 },
    // PLĖŠIMAS ANKSČIAU (patirtis: be plėšimų augimas stoja): Imperatoriaus raiteliams – Akademija 5, Kalvė 3, Arklidė 5
    { b: 'ACADEMY', l: 5 }, { b: 'SMITHY', l: 3 }, { b: 'STABLE', l: 1 }, { b: 'STABLE', l: 5 },
    { f: 6 },                                   // laukai iki 6 – tada įsijungia antro kaimo fokusas (SETTLE_FOCUS)
    // ANTRAS KAIMAS: Rezidencija 10 → 3 įsikūrėjai (šventės – po 2 kaimo)
    { b: 'RESIDENCE', l: 10 },
    // po 2 kaimo
    { b: 'CRANNY', l: 10 }, { b: 'MARKET', l: 7 },
    { b: 'MAIN', l: 10 }, { b: 'ACADEMY', l: 10 }, { b: 'TOWN_HALL', l: 1 },
    { f: 7 },
    ...POST_SETTLE,
  ];
  const PLAN_START = PLAN_START_X3;      // patikrintas planas – visiems serveriams (senasis x2 planas paliktas tik kaip atsarginis)



  // 2 kaimas: sostinė (15c / 9c). Palace vietoj Residence.
  const PLAN_CAPITAL = [
    { f: 1, only: [4] },
    { f: 2, only: [1], count: 1 }, { f: 2, only: [2], count: 1 }, { f: 2, only: [3], count: 1 }, { f: 2, only: [4], count: 1 },
    { b: 'MAIN', l: 10 },
    { f: 2 },
    { b: 'WAREHOUSE', l: 3 }, { b: 'GRANARY', l: 3 }, { b: 'RALLY', l: 1 }, { b: 'MARKET', l: 1 }, { b: 'WALL', l: 1 },
    { f: 4, order: [4, 2, 1, 3] },
    { b: 'GRAIN_MILL', l: 1 },
    { b: 'WAREHOUSE', l: 7 }, { b: 'GRANARY', l: 7 },
    { b: 'EMBASSY', l: 1 },
    { b: 'PALACE', l: 1 },
    { b: 'MARKET', l: 3 }, { b: 'WALL', l: 5 },
    { f: 7, order: [4, 2, 1, 3] },
    { b: 'GRAIN_MILL', l: 3 },
    { f: 8, order: [4, 2, 1, 3] },
    { b: 'TOWN_HALL', l: 1 },
    { b: 'WAREHOUSE', l: 12 }, { b: 'GRANARY', l: 12 },
    { b: 'PALACE', l: 10 }, { b: 'WALL', l: 10 },
    { f: 10, order: [4, 2, 1, 3] },
    { b: 'GRAIN_MILL', l: 5 }, { b: 'BAKERY', l: 5 },
    { b: 'MARKET', l: 10 },
    { f: 12, only: [4] }, { f: 15, only: [4] },
    { b: 'WAREHOUSE', l: 20 }, { b: 'GRANARY', l: 20 }, { b: 'MAIN', l: 20 },
    { b: 'MARKET', l: 15 }, { b: 'WALL', l: 20 },
  ];

  // 3 kaimas: puolimo kaimas (ne sostinė – kad tilptų Great Barracks / Great Stable).
  const PLAN_OFF = [
    { b: 'MAIN', l: 10 },
    { f: 2 },
    { b: 'RALLY', l: 1 }, { b: 'WALL', l: 3 },
    { f: 5, only: [4], count: 1 },
    { b: 'WAREHOUSE', l: 3 }, { b: 'GRANARY', l: 2 }, { b: 'MARKET', l: 1 }, { b: 'RESIDENCE', l: 1 },
    { f: 4 },
    { b: 'WAREHOUSE', l: 8 }, { b: 'GRANARY', l: 3 },
    { b: 'BARRACKS', l: 3 }, { b: 'ACADEMY', l: 5 }, { b: 'SMITHY', l: 3 }, { b: 'STABLE', l: 3 }, { b: 'WALL', l: 8 },
    { f: 6 },
    { b: 'MAIN', l: 14 }, { b: 'WALL', l: 12 },
    { b: 'WAREHOUSE', l: 12 }, { b: 'GRANARY', l: 8 },
    { b: 'BARRACKS', l: 12 }, { b: 'STABLE', l: 10 }, { b: 'ACADEMY', l: 15 }, { b: 'SMITHY', l: 10 },
    { f: 8 },
    { b: 'MAIN', l: 20 },
    { b: 'WAREHOUSE', l: 20 }, { b: 'GRANARY', l: 20 },
    { b: 'MARKET', l: 10 },
    { b: 'BARRACKS', l: 20 }, { b: 'STABLE', l: 20 }, { b: 'SMITHY', l: 20 },
    { f: 10 }, { b: 'WALL', l: 20 },
  ];

  // 4+ kaimai: resursiniai (bendruomenės gido "trečias ir tolesni kaimai").
  // 2 kaimas – HAMMER. PRADŽIA = EKONOMIKA kaip 1 kaime: mediena ir molis iki 10, tada geležis iki 10, sandėliai pagal gamybą,
  // grūdai – tik minimaliai (~25 % kitų žaliavų gamybos, pvz. +200 kai kitos po 800; trūkstamus perkam turguje),
  // tada Rezidencija 10 → 3 kaimas. Kariuomenė (Imperionai) – vėliau, kai bus resursinis 3 kaimas.
  const PLAN_HAMMER = [
    { f: 2, only: [1] }, { f: 2, only: [2] }, { f: 2, only: [3] },
    { b: 'MAIN', l: 5 }, { b: 'WAREHOUSE', l: 5 }, { b: 'GRANARY', l: 3 }, { b: 'RALLY', l: 1 }, { b: 'MARKET', l: 3 },
    { f: 5, only: [1, 2, 3] },
    { b: 'MAIN', l: 10 }, { b: 'WAREHOUSE', l: 7 }, { b: 'GRANARY', l: 5 },
    // EI gamyba Hammer kaime (nuo 2026-11-03): Akademija 5, Kalvė 3, Arklidė 5 → Imperatoriaus raiteliai
    { b: 'BARRACKS', l: 3 }, { b: 'ACADEMY', l: 5 }, { b: 'SMITHY', l: 3 }, { b: 'STABLE', l: 5 },
    // Rūmai – pastatų linijoje, KOL laukų linija kelia laukus iki 10 (kitaip pastatų linija tik keltų sandėlius be reikalo).
    // Sandėlis/klėtis – tik kai pilni (taisyklė „pilnas – kelti be eilės“). Rūmams reikia Ambasados 1; Rūmai 10 → kolonistai 3 kaimui
    { b: 'EMBASSY', l: 1 }, { b: 'PALACE', l: 10 },
    // resursų bonus pastatai – po Rūmų, kai tos žaliavos bent vienas laukas 10
    { b: 'SAWMILL', l: 5, gate: [1] }, { b: 'BRICKYARD', l: 5, gate: [2] }, { b: 'IRON_FOUNDRY', l: 5, gate: [3] },
    { f: 8, only: [1, 2, 3] },                          // geležis kyla kartu su mediena ir moliu (Rūmams reikia daug geležies)
    { f: 10, only: [1], count: 1 }, { f: 10, only: [2], count: 1 }, { f: 10, only: [3], count: 1 },   // po vieną lauką iki 10 – atrakina bonus pastatus
    { f: 10, only: [1, 2, 3] },
    // ŠVENTĖS (kultūros taškai): Rotušei reikia Gyvenamojo 10 ir Akademijos 10 (Akademijai – Kareivinių 3)
    { b: 'BARRACKS', l: 3 }, { b: 'ACADEMY', l: 10 }, { b: 'TOWN_HALL', l: 1 },
    { b: 'WAREHOUSE', l: 15 }, { b: 'GRANARY', l: 10 },
    // TIK PO ŠVENČIŲ: kariuomenė – Imperionai
    { b: 'SMITHY', l: 1 },                                                             // Imperionas: Akademija 5 + Kalvė 1
    { b: 'GRAIN_MILL', l: 5 }, { b: 'BARRACKS', l: 10 }, { b: 'SMITHY', l: 10 }, { b: 'RALLY', l: 5 },
    { b: 'GRANARY', l: 15 }, { b: 'BARRACKS', l: 20 }, { b: 'SMITHY', l: 20 }, { b: 'MAIN', l: 20 },
    { b: 'RALLY', l: 10 }, { b: 'WALL', l: 15 }, { b: 'WAREHOUSE', l: 20 }, { b: 'GRANARY', l: 20 }, { b: 'MARKET', l: 15 },
  ];
  // 3+ kaimai – RESURSINIAI (tavo gidas, su žaidimo reikalavimais, kurių gide nebuvo):
  //  Rotušei reikia Akademijos 10 (Akademijai – Kareivinių 3, joms – Susibūrimo vietos 1); Prekybos kontorai – Turgaus 20 IR Arklidės 10
  const PLAN_RESOURCE = [
    // 1 diena
    { b: 'MAIN', l: 5 }, { b: 'WAREHOUSE', l: 5 }, { b: 'GRANARY', l: 5 },
    { f: 5 },
    // 2 diena
    { b: 'MAIN', l: 10 }, { f: 8 },
    { f: 10, only: [1], count: 1 }, { f: 10, only: [2], count: 1 }, { f: 10, only: [3], count: 1 },   // po vieną medienos/molio/geležies lauką iki 10 – atrakina bonus pastatus
    { b: 'WAREHOUSE', l: 15 }, { b: 'GRANARY', l: 10 }, { b: 'MARKET', l: 10 },
    // 3 diena
    { f: 10 },
    // Resursų bonus pastatai – kai atitinkamos žaliavos bent vienas laukas jau 10 (gate = laukų gid)
    { b: 'SAWMILL', l: 5, gate: [1] }, { b: 'BRICKYARD', l: 5, gate: [2] }, { b: 'IRON_FOUNDRY', l: 5, gate: [3] }, { b: 'GRAIN_MILL', l: 5, gate: [1, 2, 3] }, { b: 'BAKERY', l: 5, gate: [1, 2, 3] },
    { b: 'RALLY', l: 1 }, { b: 'BARRACKS', l: 3 }, { b: 'ACADEMY', l: 10 },            // Rotušės reikalavimai
    { b: 'TOWN_HALL', l: 10 },                                                       // šventės – automatiškai
    { b: 'MARKET', l: 15 },
    // 4 diena
    { b: 'RESIDENCE', l: 10 },
    // toliau: Pretorijonai (Kalvė), Prekybos kontora (reikia Arklidės 10), talpos
    { b: 'SMITHY', l: 3 }, { b: 'WALL', l: 10 },
    { b: 'WAREHOUSE', l: 20 }, { b: 'GRANARY', l: 20 }, { b: 'MAIN', l: 20 }, { b: 'WALL', l: 13 },
  ];
  const PLAN_RESOURCE_OLD = [
    { b: 'MAIN', l: 10 },
    { f: 2 },
    { b: 'RALLY', l: 1 }, { b: 'WALL', l: 3 },
    { f: 5, only: [4], count: 1 },
    { b: 'WAREHOUSE', l: 3 }, { b: 'GRANARY', l: 2 }, { b: 'MARKET', l: 1 }, { b: 'RESIDENCE', l: 1 },
    { b: 'MAIN', l: 14 }, { b: 'WALL', l: 8 },
    { b: 'WAREHOUSE', l: 8 }, { b: 'GRANARY', l: 3 },
    { b: 'MAIN', l: 20 },
    { f: 8 },
    { f: 10, only: [1], count: 1 }, { f: 10, only: [2], count: 1 }, { f: 10, only: [3], count: 1 }, { f: 10, only: [4], count: 1 },
    { f: 9 }, { f: 10 },
    { b: 'SAWMILL', l: 3 }, { b: 'BRICKYARD', l: 3 }, { b: 'IRON_FOUNDRY', l: 3 },
    { b: 'GRAIN_MILL', l: 4 }, { b: 'BAKERY', l: 3 },
    { b: 'MARKET', l: 10 }, { b: 'TRADE_OFFICE', l: 5 },
    { b: 'WAREHOUSE', l: 15 }, { b: 'GRANARY', l: 12 },
    { b: 'SAWMILL', l: 5 }, { b: 'BRICKYARD', l: 5 }, { b: 'IRON_FOUNDRY', l: 5 },
    { b: 'GRAIN_MILL', l: 5 }, { b: 'BAKERY', l: 5 },
    { b: 'WAREHOUSE', l: 20 }, { b: 'GRANARY', l: 20 }, { b: 'MARKET', l: 15 },
    { b: 'TRADE_OFFICE', l: 10 }, { b: 'TOWN_HALL', l: 10 }, { b: 'WALL', l: 15 },
  ];

  const PLANS = { RESOURCE_START: PLAN_START, HAMMER: PLAN_HAMMER, CAPITAL: PLAN_CAPITAL, OFF: PLAN_OFF, RESOURCE: PLAN_RESOURCE };
  // ======================

  // ---------- Pagalbinės ----------
  const log = (...a) => console.log('[AB]', ...a);
  const rand = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  const enabled = () => GM_getValue('enabled', false);
  // Atidarytas skripto langas (Kariai, Aukcionas, Fermos, Vietos) – skriptas laukia, kol uždarysi (bet ne ilgiau 10 min.), kad neperkrautų puslapio
  const uiOpen = () => {
    const el = document.querySelector('#abTrain, #abAuc, #abFarms, #abSites, #abMkt, #abHero, #abStats, #abOrd');
    if (!el) return false;
    if (!el.dataset.t) el.dataset.t = String(Date.now());
    return Date.now() - +el.dataset.t < 10 * 60000;
  };
  const later = (sec, fn) => setTimeout(function run() { if (uiOpen()) return setTimeout(run, 3000); fn(); }, sec * 1000);
  const sleep = ms => new Promise(r => { const go = () => (uiOpen() ? setTimeout(go, 3000) : r()); setTimeout(go, ms); });
  const num = el => (el ? parseInt(el.textContent.replace(/[^\d]/g, ''), 10) || 0 : 0);
  const jget = (k, d) => { try { return JSON.parse(GM_getValue(k, '')) || d; } catch (e) { return d; } };
  const jset = (k, v) => GM_setValue(k, JSON.stringify(v));

  // Reakcijos laikas: dažniausiai kelios sekundės, bet kartais ir minutė–dvi, retai kelios minutės ("nukrypo dėmesys")
  function humanDelay() {
    if (wakeActive()) return rand(1, 5);           // nakties serija – be ilgų pauzių
    const r = Math.random();                       // greitas žaidėjas: dažniausiai 1–4 s, retai ilgesnė „dėmesio“ pauzė
    if (r < 0.70) return rand(1, 4);
    if (r < 0.92) return rand(4, 12);
    if (r < 0.985) return rand(12, 40);
    return rand(40, 100);
  }
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rand(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const hhmm = ts => new Date(ts).toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' });

  // ---------- Kaimai ----------
  function allVillages() {
    return [...document.querySelectorAll('#sidebarBoxVillageList .listEntry.village')]
      .map(e => e.getAttribute('data-did')).filter(Boolean)
      .sort((a, b) => Number(a) - Number(b));
  }
  function activeDid() {
    const a = document.querySelector('#sidebarBoxVillageList .listEntry.village.active');
    return (a && a.getAttribute('data-did')) || new URL(location.href).searchParams.get('newdid') || 'x';
  }
  const DID = activeDid();
  function roleOf(did) {
    if (ROLE_OVERRIDE[did]) return ROLE_OVERRIDE[did];
    const i = allVillages().indexOf(did);
    return ROLE_ORDER[i] || 'RESOURCE';
  }
  const ROLE = roleOf(DID);
  const PLAN = PLANS[ROLE] || PLAN_RESOURCE;
  const vkey = k => k + '@' + DID;
  const vget = (k, d) => GM_getValue(vkey(k), d);
  const vset = (k, v) => GM_setValue(vkey(k), v);

  let statusEl;
  function setStatus(t) { if (statusEl) statusEl.textContent = `[${ROLE} #${DID}] ${t}`; log(ROLE, DID, t); }

  function addUI() {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;bottom:10px;left:10px;z-index:99999;font:12px sans-serif';
    const b = document.createElement('button');
    const paint = () => {
      const ver = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '?';
      b.textContent = (enabled() ? '■ STOP  (skriptas veikia – spausk sustabdyti)' : '▶ START  (skriptas sustabdytas – spausk paleisti)') + '  v' + ver;
      b.style.background = enabled() ? '#a33' : '#3a3';
    };
    b.style.cssText = 'padding:10px 14px;color:#fff;border:0;border-radius:6px;font-weight:bold;cursor:pointer;display:block;font-size:13px';
    b.onclick = () => { GM_setValue('enabled', !enabled()); GM_setValue('pending', 'null'); GM_setValue('chore', ''); GM_setValue('sessEnd', 0); GM_setValue('breakEnd', 0);
      if (enabled()) GM_setValue('awakeUntil', Date.now() + rand(...MANUAL_AWAKE_H) * 3600 * 1000);   // įjungei ranka – naktis nesvarbu, nauja sesija iškart
      paint();
      if (enabled()) location.href = '/dorf1.php';
      else { setStatus('SUSTABDYTA'); log('Skriptas sustabdytas mygtuku STOP'); location.reload(); }   // perkrovus – visi laikmačiai dingsta, skriptas nieko nedaro
    };
    paint();
    // STATYBOS (laukai + pastatai) atskirai nuo viso skripto: išjungus – nieko nekelia, resursai lieka kariams (karo režimas)
    const bB = document.createElement('button');
    const paintB = () => { const on = GM_getValue('buildOn', true); bB.textContent = on ? 'Statybos: ĮJUNGTOS (spausk – karo režimas)' : 'Statybos: IŠJUNGTOS – karo režimas, resursai kariams'; bB.style.background = on ? '#4a4' : '#c60'; };
    bB.style.cssText = 'padding:5px 10px;color:#fff;border:0;border-radius:6px;font-weight:bold;cursor:pointer;display:block;margin-top:3px;font-size:12px';
    bB.onclick = () => { GM_setValue('buildOn', !GM_getValue('buildOn', true)); for (const v of allVillages()) GM_setValue('trainNext@' + v, 0); log('Statybos:', GM_getValue('buildOn', true) ? 'įjungtos' : 'IŠJUNGTOS (karo režimas)'); paintB(); };
    paintB();
    const bD = document.createElement('button');
    const paintD = () => { const on = GM_getValue('defRaid', true); bD.textContent = on ? 'Gynėjai reiduose: LEIDŽIAMA (legion., pretor.)' : 'Gynėjai reiduose: DRAUDŽIAMA – visi gynėjai namie'; bD.style.background = on ? '#46a' : '#c60'; };
    bD.style.cssText = 'padding:4px 10px;color:#fff;border:0;border-radius:6px;font-weight:bold;cursor:pointer;display:block;margin-top:3px;font-size:11px';
    bD.onclick = () => { GM_setValue('defRaid', !GM_getValue('defRaid', true)); log('Gynėjai reiduose:', GM_getValue('defRaid', true) ? 'leidžiama' : 'DRAUDŽIAMA'); paintD(); };
    paintD();
    const b2 = document.createElement('button');
    const paint2 = () => {
      const on = GM_getValue('heroAutoRes', true);
      b2.textContent = on ? 'Hero resursai: AUTO' : 'Hero resursai: RANKINIS';
      b2.style.background = on ? '#46a' : '#777';
    };
    b2.style.cssText = 'padding:4px 10px;color:#fff;border:0;border-radius:6px;font-weight:bold;cursor:pointer;display:block;margin-top:3px;font-size:11px';
    b2.onclick = () => { GM_setValue('heroAutoRes', !GM_getValue('heroAutoRes', true)); paint2(); };
    paint2();
    statusEl = document.createElement('div');
    statusEl.style.cssText = 'background:#000a;color:#fff;padding:3px 6px;margin-top:3px;border-radius:4px;max-width:340px';
    const b3 = document.createElement('button');
    const paint3 = () => {
      const on = GM_getValue('videoBoost', true);
      b3.textContent = on ? 'Reklamos pagreitis: ĮJUNGTAS' : 'Reklamos pagreitis: IŠJUNGTAS';
      b3.style.background = on ? '#a6a' : '#777';
    };
    b3.style.cssText = 'padding:4px 10px;color:#fff;border:0;border-radius:6px;font-weight:bold;cursor:pointer;display:block;margin-top:3px;font-size:11px';
    b3.onclick = () => { GM_setValue('videoBoost', !GM_getValue('videoBoost', true)); paint3(); };
    paint3();
    const b4 = document.createElement('button');
    const modes = ['off', 'test', 'on'];
    const paint4 = () => {
      const m = GM_getValue('oasisMode', 'on');
      const note = GM_getValue('oasisNote', '');
      b4.textContent = (m === 'on' ? 'Oazės: ĮJUNGTOS' : m === 'test' ? 'Oazės: BANDYMAS' : 'Oazės: IŠJUNGTOS') + (m !== 'off' && note ? ' – ' + note : '');
      b4.style.background = m === 'on' ? '#b52' : m === 'test' ? '#a80' : '#777';
    };
    b4.style.cssText = 'padding:4px 10px;color:#fff;border:0;border-radius:6px;font-weight:bold;cursor:pointer;display:block;margin-top:3px;font-size:11px';
    b4.onclick = () => { const m = GM_getValue('oasisMode', 'on'); GM_setValue('oasisMode', modes[(modes.indexOf(m) + 1) % 3]); GM_setValue('oasisNext', 0); paint4(); };
    paint4();
    const b5 = document.createElement('button');
    const paint5 = () => {
      const left = (GM_getValue('rushUntil', 0) || 0) - Date.now();
      const sn = (GM_getValue('shortNightUntil', 0) || 0) > Date.now();
      b5.textContent = left > 0 ? `Skubus režimas: dar ${Math.floor(left / 3600000)} val. ${Math.floor((left % 3600000) / 60000)} min.` + (sn ? `, naktis ${SHORT_NIGHT_H} val.` : '') + ' (spausk – nutraukti)' : `Skubus režimas (naktis tik ${SHORT_NIGHT_H} val.)`;
      b5.style.background = left > 0 ? '#c33' : '#357';
    };
    b5.style.cssText = 'padding:4px 10px;color:#fff;border:0;border-radius:6px;font-weight:bold;cursor:pointer;display:block;margin-top:3px;font-size:11px';
    b5.onclick = () => {
      if ((GM_getValue('rushUntil', 0) || 0) > Date.now()) { GM_setValue('rushUntil', 0); GM_setValue('shortNightUntil', 0); GM_setValue('pauseW', 'null'); paint5(); return; }
      GM_setValue('rushUntil', Date.now() + RUSH_HOURS * 3600000);
      GM_setValue('shortNightUntil', Date.now() + 30 * 3600000);      // artimiausia naktis – tik SHORT_NIGHT_H val.
      GM_setValue('pauseW', 'null');
      GM_setValue('awakeUntil', Date.now() + RUSH_HOURS * 3600000);
      GM_setValue('enabled', true); GM_setValue('pending', 'null'); GM_setValue('chore', '');
      GM_setValue('sessEnd', 0); GM_setValue('breakEnd', 0);
      location.href = '/dorf1.php';
    };
    paint5();
    const b6 = document.createElement('button');
    const paint6 = () => { const on = GM_getValue('trainOn', true), m = trainCfgFor(DID).mode; b6.textContent = on ? `Kariai: ĮJUNGTA (šis kaimas: ${m === 'auto' ? 'AUTO' : m === 'off' ? 'IŠJUNGTA' : 'PASIRINKTA'})` : 'Kariai: IŠJUNGTA'; b6.style.background = on ? '#686' : '#777'; };
    b6.style.cssText = 'padding:4px 10px;color:#fff;border:0;border-radius:6px;font-weight:bold;cursor:pointer;display:block;margin-top:3px;font-size:11px';
    b6.onclick = () => showTrainPanel();
    paint6();
    const b7 = document.createElement('button');
    const paint7 = () => { const on = GM_getValue('cagesOn', false); b7.textContent = on ? `Narvai: ĮJUNGTA (${GM_getValue('cagesBag', 0)}+${GM_getValue('cagesEq', 0)})` : 'Narvai: IŠJUNGTA'; b7.style.background = on ? '#864' : '#777'; };
    b7.style.cssText = 'padding:4px 10px;color:#fff;border:0;border-radius:6px;font-weight:bold;cursor:pointer;display:block;margin-top:3px;font-size:11px';
    b7.onclick = () => { GM_setValue('cagesOn', !GM_getValue('cagesOn', false)); GM_setValue('cagesDirty', 1); GM_setValue('oasisCache', '{}'); GM_setValue('oasisNext', 0); paint7(); };
    paint7();
    const b8 = document.createElement('button');
    b8.textContent = `Fermos (${Object.values(jget('farms', {})).filter(f => farmStatus(f).st !== 'aktyvus' && farmStatus(f).st !== 'naujas').length})` + (GM_getValue('raidNote', '') ? ' – ' + GM_getValue('raidNote', '') : '');
    b8.style.cssText = 'padding:4px 10px;color:#fff;border:0;border-radius:6px;font-weight:bold;cursor:pointer;display:block;margin-top:3px;font-size:11px;background:#546';
    b8.onclick = showFarms;
    const b9 = document.createElement('button');
    b9.textContent = `Vietos (${(jget('sites', { list: [] }).list || []).length})`;
    b9.style.cssText = 'padding:4px 10px;color:#fff;border:0;border-radius:6px;font-weight:bold;cursor:pointer;display:block;margin-top:3px;font-size:11px;background:#357';
    b9.onclick = showSites;
    const bK = document.createElement('button');
    const vName = d => (allVillages().indexOf(d) + 1) + ' kaimas „' + clean((document.querySelector(`#sidebarBoxVillageList .listEntry.village[data-did="${d}"] .name`) || {}).textContent || d).trim() + '“';   // eilė pagal įkūrimą
    const paintK = () => { const c = GM_getValue('heroResVil', 'auto'); bK.textContent = 'Kuprinės resursai → ' + (c === 'auto' || !allVillages().includes(c) ? `AUTO (naujausias: ${vName(heroResDid())})` : vName(c)); bK.style.background = '#6a6a46'; };
    bK.style.cssText = 'padding:4px 10px;color:#fff;border:0;border-radius:6px;font-weight:bold;cursor:pointer;display:block;margin-top:3px;font-size:11px';
    bK.onclick = () => {                                                   // AUTO → 1 kaimas → 2 kaimas → … → AUTO
      const opts = ['auto', ...allVillages()], c = GM_getValue('heroResVil', 'auto');
      GM_setValue('heroResVil', opts[(Math.max(0, opts.indexOf(c)) + 1) % opts.length]);
      GM_setValue('heroResNext@' + heroResDid(), 0);                       // pasirinktas kaimas – patikrinti greitai
      paintK();
    };
    paintK();
    const bN = document.createElement('button');
    bN.textContent = 'NPC mainai DABAR (mediena/molis 95 %)';
    bN.style.cssText = 'padding:4px 10px;color:#fff;border:0;border-radius:6px;font-weight:bold;cursor:pointer;display:block;margin-top:3px;font-size:11px;background:#c70';
    bN.onclick = () => {
      if (!confirm('Pakeisti resursus per NPC (kainuos ~3 aukso)? Mediena ir molis ~95 %, likutis – geležis/grūdai.')) return;
      GM_setValue('npcManual', true); GM_setValue('pending', 'null');
      startChore('npc', '/build.php?gid=17&t=0');
    };
    const bE = document.createElement('button');
    bE.textContent = `Eiga: ${jget('progLog', []).length} įrašų (atsisiųsti)`;
    bE.style.cssText = 'padding:4px 10px;color:#fff;border:0;border-radius:6px;font-weight:bold;cursor:pointer;display:block;margin-top:3px;font-size:11px;background:#555';
    bE.onclick = exportProgress;
    const bA = document.createElement('button');
    const paintA = () => {
      const m = GM_getValue('aucMode', 'test');
      bA.textContent = (m === 'on' ? 'Aukcionas: ĮJUNGTAS' : m === 'test' ? 'Aukcionas: BANDYMAS' : 'Aukcionas: IŠJUNGTAS') + (m !== 'off' && GM_getValue('aucNote', '') ? ' – ' + GM_getValue('aucNote', '') : '');
      bA.style.background = m === 'on' ? '#b52' : m === 'test' ? '#a80' : '#777';
    };
    bA.style.cssText = 'padding:4px 10px;color:#fff;border:0;border-radius:6px;font-weight:bold;cursor:pointer;display:block;margin-top:3px;font-size:11px';
    bA.onclick = () => { const ms = ['off', 'test', 'on']; GM_setValue('aucMode', ms[(ms.indexOf(GM_getValue('aucMode', 'test')) + 1) % 3]); GM_setValue('aucNext', 0); paintA(); };
    paintA();
    const bAL = document.createElement('button');
    bAL.textContent = 'Aukciono sąrašas (ką pirkti ir už kiek)';
    bAL.style.cssText = 'padding:4px 10px;color:#fff;border:0;border-radius:6px;font-weight:bold;cursor:pointer;display:block;margin-top:3px;font-size:11px;background:#357';
    bAL.onclick = showAuction;
    const bMk = document.createElement('button');
    bMk.textContent = (() => { const c = jget('mktCfg', {}); const pv = c.prio && ownVillageList().find(v => v.did === c.prio); return 'Turgus' + (pv ? ` – viskas → „${pv.name}“` : ' (siuntimai tarp kaimų)'); })();
    bMk.style.cssText = 'padding:4px 10px;color:#fff;border:0;border-radius:6px;font-weight:bold;cursor:pointer;display:block;margin-top:3px;font-size:11px;background:#357';
    bMk.onclick = showMarket;
    const bOr = document.createElement('button');
    bOr.textContent = (() => { const n = Object.values(jget('orders', {}) || {}).reduce((a, l) => a + l.length, 0); return `Statybų užsakymai${n ? ` (${n})` : ''}`; })();
    bOr.style.cssText = 'padding:4px 10px;color:#fff;border:0;border-radius:6px;font-weight:bold;cursor:pointer;display:block;margin-top:3px;font-size:11px;background:#a63';
    bOr.onclick = showOrders;
    const bSt = document.createElement('button');
    bSt.textContent = (() => { const st = jget('stats', []).filter(e => Date.now() - e.ts < 24 * 3600000); const net = st.reduce((a, e) => a + e.loot - e.lost, 0); return `Pelnas 24 val.: ${net >= 0 ? '+' : ''}${Math.round(net).toLocaleString('lt-LT')}`; })();
    bSt.style.cssText = 'padding:4px 10px;color:#fff;border:0;border-radius:6px;font-weight:bold;cursor:pointer;display:block;margin-top:3px;font-size:11px;background:#357';
    bSt.onclick = showStats;
    const bH = document.createElement('button');
    bH.textContent = (() => { const c = hc(); return `Karžygys: oazės nuo ${c.oasisMin} %, nuotykiai ${c.adv ? 'nuo ' + c.advMin + ' %' : 'IŠJ.'}`; })();
    bH.style.cssText = 'padding:4px 10px;color:#fff;border:0;border-radius:6px;font-weight:bold;cursor:pointer;display:block;margin-top:3px;font-size:11px;background:#7a4';
    bH.onclick = showHero;
        wrap.append(b, bB, bOr, bH, bD, bSt, b2, bK, b3, b4, b5, b6, b7, b8, b9, bA, bAL, bMk, bN, bE, statusEl);
    document.body.appendChild(wrap);
  }

  function pauseWindow() {
    const today = new Date().toDateString();
    let w = jget('pauseW', null);
    const short = (GM_getValue('shortNightUntil', 0) || 0) > Date.now();
    if (!w || w.day !== today || !!w.short !== short) {
      if (short) { const f = 2 + Math.random() * 2; w = { day: today, from: f, to: f + SHORT_NIGHT_H, short: true }; }   // START: pauzė ~2 val. tarp 2 ir 6 ryto
      else w = { day: today, from: 1 + Math.random() * 2.5, to: 6 + Math.random() * 2.5 };
      // „atsikėlimas“ nakčia: vienas trumpas langas pauzės viduryje (tik ilgoje pauzėje) – statybos, reidai, herojus
      if (NIGHT_WAKE && w.to - w.from >= 4) {
        const at = w.from + (w.to - w.from) * (0.35 + Math.random() * 0.3);
        w.wakeFrom = at; w.wakeTo = at + rand(...NIGHT_WAKE_MIN) / 60;
      }
      jset('pauseW', w);
    }
    return w;
  }
  function nowHour() { const d = new Date(); return d.getHours() + d.getMinutes() / 60; }
  // Kiek valandų iki nakties pauzės pradžios (0 – jau pauzė); kitos dienos pradžia nežinoma – ~2:15
  function hoursToPauseStart() {
    const w = pauseWindow(), h = nowHour();
    if (h < w.from) return w.from - h;
    if (h < w.to) return 0;
    return 24 - h + 2.25;
  }
  function inPause() {
    if (!NIGHT_PAUSE) return false;
    if (Date.now() < (GM_getValue('awakeUntil', 0) || 0) || Date.now() < (GM_getValue('rushUntil', 0) || 0)) return false;
    const w = pauseWindow(), h = nowHour();
    if (w.wakeFrom && h >= w.wakeFrom && h < w.wakeTo) {                 // nakties „atsikėlimas“
      if (GM_getValue('wakeDone_' + w.day, false)) return true;          // serija baigta – miegam toliau
      if (!GM_getValue('wakeLogged_' + w.day, false)) {
        GM_setValue('wakeLogged_' + w.day, true); GM_setValue('wakeActive', w.day);
        GM_setValue('sessEnd', 0); GM_setValue('breakEnd', 0);
        // visi darbai „subręsta“ iškart: reidai, herojus, užduotys, kariai
        for (const k of ['oasisNext', 'advNext', 'advBadgeNext', 'questBadgeNext', 'starNext']) GM_setValue(k, 0);
        for (const k of ['flNext', 'raidNext', 'trainNext', 'taskNext', 'heroResNext', 'eoNext']) vset(k, 0);
        log('Nakties atsikėlimas: visa serija iš eilės, tada vėl miegas');
      }
      return false;
    }
    return h >= w.from && h < w.to;
  }
  const wakeActive = () => { const w = jget('pauseW', null); return !!(w && GM_getValue('wakeActive', '') === w.day && !GM_getValue('wakeDone_' + w.day, false)); };
  function wakeFinish() {                                               // nebėra ką daryti – serija baigta
    const w = jget('pauseW', null); if (!w) return false;
    GM_setValue('wakeDone_' + w.day, true); GM_setValue('wakeActive', '');
    log('Nakties serija baigta – miegu iki ryto'); setStatus('nakties serija baigta – miegu');
    later(pauseWakeSec(), () => (location.href = '/dorf1.php'));
    return true;
  }
  function pauseWakeSec() {
    const w = pauseWindow(), h = nowHour();
    const next = (w.wakeFrom && h < w.wakeFrom) ? w.wakeFrom : w.to;       // pirma – atsikėlimas, paskui – rytas
    return Math.max(60, (next - h) * 3600) + rand(30, next === w.to ? 900 : 180);
  }

  // Darbo sesijos ir pertraukos. Grąžina true, jei dabar pertrauka (tada nieko nedarome iki jos pabaigos).
  function breakCheck() {
    const now = Date.now();
    if (now < (GM_getValue('rushUntil', 0) || 0)) return false;          // START režimas – be pertraukų
    let sessEnd = GM_getValue('sessEnd', 0) || 0, breakEnd = GM_getValue('breakEnd', 0) || 0;
    const last = GM_getValue('lastSeen', 0) || 0;
    GM_setValue('lastSeen', now);
    if (!sessEnd) { sessEnd = now + rand(...WORK) * 60000; GM_setValue('sessEnd', sessEnd); }
    // Jei skriptas ilgai nedirbo (atsijungęs, uždarytas langas, ilgas laukimas) – tas laikas jau buvo „pertrauka“, pradedam naują sesiją
    if (now >= breakEnd && now >= sessEnd && last && now - last > BREAK[0] * 60000) {
      sessEnd = now + rand(...WORK) * 60000;
      GM_setValue('sessEnd', sessEnd);
    }
    if (now >= breakEnd && now >= sessEnd) {
      const len = Math.random() < LONG_BREAK_CHANCE ? rand(...LONG_BREAK) : rand(...BREAK);
      breakEnd = now + len * 60000;
      GM_setValue('breakEnd', breakEnd);
      GM_setValue('sessEnd', breakEnd + rand(...WORK) * 60000);
    }
    if (now < breakEnd) {
      setStatus(`pertrauka iki ${hhmm(breakEnd)}`);
      later(Math.max(30, (breakEnd - now) / 1000) + humanDelay(), () => (location.href = '/dorf1.php'));
      return true;
    }
    return false;
  }

  // Jei kurį laiką nesilankėme, pradedame apvažiavimą: aplankome visus kitus kaimus atsitiktine tvarka
  function planRound() {
    const now = Date.now(), last = GM_getValue('lastSeen', 0) || 0;
    GM_setValue('lastSeen', now);
    const others = allVillages().filter(v => v !== DID);
    if (others.length && now - last > ROUND_IDLE * 60000) jset('roundLeft', shuffle(others));
  }

  // Kito kaimo / perkrovimo planavimas: kiekvienam kaimui saugomas "kada vėl tikrinti"
  // Kaimas aplankomas ne rečiau kaip kas VISIT_MAX_MIN, net jei statybų eilė užimta ilgai – kitaip stoja plėšimai, oazės, rėmimas
  const VISIT_MAX_MIN = { RESOURCE_START: 10, HAMMER: 10 };            // kariniai kaimai (EI) – kas 10 min.; kiti – kas 30 min.
  function scheduleNext(waitSec) {
    const due = jget('due', {});
    waitSec = Math.min(waitSec, (VISIT_MAX_MIN[ROLE] || 30) * 60);
    due[DID] = Date.now() + waitSec * 1000;
    jset('due', due);
    // Apvažiavimas: kol neapėjome visų kaimų, einame tiesiai į kitą (greitai, kaip žmogus spaudinėdamas kaimų sąrašą)
    const vs = allVillages();
    const left = jget('roundLeft', []).filter(v => v !== DID && vs.includes(v));
    if (left.length) {
      const next = left.shift();
      jset('roundLeft', left);
      later(rand(...VILLAGE_GAP) + (Math.random() < 0.25 ? humanDelay() : 0), () => (location.href = `/dorf1.php?newdid=${next}`));
      return;
    }
    jset('roundLeft', []);
    let best = DID, bestT = due[DID];
    for (const v of vs) { const t = due[v] || 0; if (t < bestT) { best = v; bestT = t; } }
    const diff = Math.max(0, (bestT - Date.now()) / 1000);
    if (best === DID) {
      later(Math.max(diff, 5), () => (location.href = '/dorf1.php'));
    } else {
      later(Math.max(diff, rand(...VILLAGE_GAP) + (Math.random() < 0.3 ? humanDelay() : 0)), () => (location.href = `/dorf1.php?newdid=${best}`));
    }
  }

  // ---------- Duomenų skaitymas ----------
  function readFields(doc) {
    return [...doc.querySelectorAll('#resourceFieldContainer a.resourceField')].map(a => ({
      slot: new URL(a.getAttribute('href'), location.origin).searchParams.get('id'),
      lvl: parseInt((a.className.match(/level(\d+)/) || [])[1], 10) || 0,
      gid: parseInt((a.className.match(/gid(\d)/) || [])[1], 10) || 1,
      uc: a.classList.contains('underConstruction'),
      good: a.classList.contains('good'),
    }));
  }

  function readBuildings(doc) {
    const out = [];
    doc.querySelectorAll('.buildingSlot[data-aid]').forEach(s => {
      const aid = parseInt(s.getAttribute('data-aid'), 10);
      if (!aid || aid < 19) return;
      const gid = parseInt(s.getAttribute('data-gid'), 10) || 0;
      const lab = s.querySelector('.labelLayer');
      const lvl = lab ? parseInt(lab.textContent, 10) || 0
                      : parseInt((s.innerHTML.match(/level(\d+)/) || [])[1], 10) || 0;
      const uc = !!s.querySelector('.underConstruction') || s.classList.contains('underConstruction');
      const lv = s.querySelector('a.level, .level');
      const good = !!(lv && /\bgood\b/.test(lv.className));          // žaidimas pažymi, kai galima statyti dabar
      out.push({ slot: aid, gid, lvl, uc, good });
    });
    return out;
  }

  const bInfo = (builds, gid) => {
    const m = builds.filter(x => x.gid === gid);
    if (!m.length) return { eff: 0, slot: null, uc: false };
    const best = m.sort((a, b) => b.lvl - a.lvl)[0];
    return { eff: best.lvl + (best.uc ? 1 : 0), slot: best.slot, uc: best.uc };
  };

  // ---------- Žingsnių praleidimas (kai neįmanomas) ----------
  const skipKey = k => DID + ':' + k;
  const isSkipped = k => (jget('skip', {})[skipKey(k)] || 0) > Date.now();
  function registerFail(k) {
    const f = jget('fails', {});
    f[skipKey(k)] = (f[skipKey(k)] || 0) + 1;
    if (f[skipKey(k)] >= FAIL_LIMIT) {
      const s = jget('skip', {});
      s[skipKey(k)] = Date.now() + SKIP_HOURS * 3600 * 1000;
      jset('skip', s);
      f[skipKey(k)] = 0;
      log('Žingsnis laikinai praleistas (neįmanomas?):', k);
    }
    jset('fails', f);
  }
  function clearFail(k) { const f = jget('fails', {}); delete f[skipKey(k)]; jset('fails', f); }

  // ---------- Sprendimas ----------
  const effLvl = f => f.lvl + (f.uc ? 1 : 0);

  // ANTRO KAIMO FOKUSAS: kol yra tik 1 kaimas ir nėra Rezidencijos 10 ar 3 įsikūrėjų – keliama TIK Rezidencija,
  // laukai, užpildai ir karių treniravimas sustabdyti (išimtis – sandėlis/klėtis, kai jau pilni)
  function settleFocus() {
    if (!SETTLE_FOCUS || allVillages().length > 1) return false;
    // įsijungia tik kai medienos/molio/geležies laukai vidutiniškai pasiekė SETTLE_FOCUS_FIELDS (naujame serveryje – ne iš karto)
    if (!vget('focusOn', false)) {
      const f = readFields(document).filter(x => x.gid !== 4);
      const avg = f.length ? f.reduce((a, x) => a + x.lvl, 0) / f.length : 0;
      if (avg < SETTLE_FOCUS_FIELDS) return false;
      vset('focusOn', true);                                           // vieną kartą įsijungęs – lieka iki 2 kaimo
      log('Antro kaimo fokusas įjungtas (laukai vidutiniškai', avg.toFixed(1) + ')');
    }
    const lv = vget('blv', {}) || {};
    return (lv[25] || 0) < 10 || (stGet().have || 0) < 3;
  }
  // Įkūrus 2 kaimą: 1 kaime EI_RUSH_H val. nieko nestatom – visi resursai Imperatoriaus raiteliams (ir žvalgams)
  function eiRush() {
    if (ROLE !== 'RESOURCE_START' || allVillages().length < 2) return false;
    let t0 = vget('eiRushStart', 0);
    if (!t0) { t0 = Date.now(); vset('eiRushStart', t0); log('EI kepimas: 1 kaime statybos sustabdytos', EI_RUSH_H, 'val.'); }
    return Date.now() < t0 + EI_RUSH_H * 3600000;
  }
  // Pigus užpildas (žr. CHEAP_FILL): tik pastatai, kurių plane reikės aukštesnio lygio; pigiausias pirma
  // slėptuvių nebeliesti (nekelti, nestatyti): griaunama dėl vietos arba ką tik trūko vietos plano pastatui
  const crannyOff = () => vget('crannyDropped', false) || Date.now() - (vget('needSlot', 0) || 0) < 6 * 3600000;
  function cheapFill(builds, have, EARLY) {
    const np = vget('nextPlanB', null); if (!np) return null;
    const pc = bCost(np.gid, np.lvl); if (!pc) return null;
    const pSum = pc.reduce((a, v) => a + v, 0);
    const k = np.gid + ':' + np.lvl;
    let spent = vget('cheapSpent', { k: '', sum: 0 });
    if (spent.k !== k) spent = { k, sum: 0 };                                  // naujas laukiamas pastatas – skaičiuojam iš naujo
    const planMax = {};
    for (const st of PLAN) if (st.b && B[st.b]) planMax[B[st.b].gid] = Math.max(planMax[B[st.b].gid] || 0, st.l);
    planMax[23] = Math.max(planMax[23] || 0, CRANNY_N[ROLE] ? 10 : 5);         // slėptuvės – pigi apsauga nuo plėšimų po apsaugos pabaigos
    const lvlCap = gid => Math.min(planMax[gid] || 0, EARLY ? EARLY_BLD_MAX : FILLER_MAX_LVL);
    const fits = c => c && c.reduce((a, v) => a + v, 0) <= pSum * CHEAP_FILL_SHARE && spent.sum + c.reduce((a, v) => a + v, 0) <= pSum * CHEAP_FILL_TOTAL && c.every((v, i) => have[i] >= v);
    const opts = [];
    for (const x of builds) {                                                 // esami pastatai
      if (!(x.gid > 0) || x.uc || !x.good || x.gid === np.gid || isSkipped('cheap' + x.slot) || (x.gid === 23 && crannyOff())) continue;
      if (x.lvl >= lvlCap(x.gid)) continue;
      const c = bCost(x.gid, x.lvl + 1);
      if (fits(c)) opts.push({ c, r: { lane: 'building', kind: 'upgrade', slot: x.slot, gid: x.gid, key: 'cheap' + x.slot, desc: `pigus užpildas: pastatas #${x.slot} → ${x.lvl + 1} (laukiant ${Object.keys(B).find(n => B[n].gid === np.gid) || np.gid} ${np.lvl})` } });
    }
    // laisvos vietos, kurių reikės dar nepastatytiems plano pastatams – jų slėptuvės neužima
    const freeSlots = builds.filter(x => x.slot <= 38 && x.gid === 0);
    const missingPlan = Object.keys(planMax).filter(g => +g !== 23 && +g !== 16 && +g !== 31 && !builds.some(x => x.gid === +g)).length;
    for (const [g, req] of Object.entries(CHEAP_NEW)) {                       // nauji (jų dar nėra), jei plane jų reikės
      const gid = +g;
      if (!planMax[gid] || isSkipped('cheapNew' + gid)) continue;
      const have = builds.filter(x => x.gid === gid);
      if (gid === 23) {                                                       // slėptuvės: 2-as kaimas – iki 2, resursiniai – iki 4
        if (crannyOff()) continue;
        if (have.length >= (CRANNY_N[ROLE] || 1)) continue;
        if (have.some(x => x.lvl < 10 && !x.uc) && have.length) continue;     // nauja – tik kai esamos jau 10
        if (freeSlots.length - missingPlan < 1) continue;                     // vieta reikalinga plano pastatams
        if (Date.now() - (vget('needSlot', 0) || 0) < 6 * 3600000) continue;  // ką tik trūko vietos – naujų nestatom
      } else if (have.length) continue;
      if (!req.every(([rg, rl]) => bInfo(builds, rg).eff >= rl)) continue;
      const slot = (freeSlots[0] || {}).slot;
      if (!slot) continue;
      const c = bCost(gid, 1);
      const def = Object.values(B).find(d => d.gid === gid);
      if (fits(c)) opts.push({ c, r: { lane: 'building', kind: 'new', slot, gid, cat: def.cat, key: 'cheapNew' + gid, desc: `pigus užpildas: naujas pastatas ${gid} (vieta ${slot})` } });
    }
    if (!opts.length) return null;
    opts.sort((a, b) => a.c.reduce((p, v) => p + v, 0) - b.c.reduce((p, v) => p + v, 0));
    const best = opts[0];
    vset('cheapSpent', { k, sum: spent.sum + best.c.reduce((a, v) => a + v, 0) });   // (įrašoma iš anksto; nepavykus – vis tiek saugu, tik mažiau užpildo)
    return best.r;
  }
  function decide(fields, builds, have, caps, free, blockedB) {
    const FOCUS = settleFocus() || eiRush();
    const fieldLaneFree = free.field;
    // NAUJAS KAIMAS (ne 1-as): kol medienos/molio/geležies laukai vidutiniškai < EARLY_FIELDS_UNTIL – pastatai tik iki EARLY_BLD_MAX lygio
    // (Gyvenamasis – iki 10), kad resursai eitų laukams; kai kaimas pats save išlaiko – aukštesni lygiai
    const nonCrop = fields.filter(f => f.gid !== 4);
    const avgNC = nonCrop.length ? nonCrop.reduce((a, f) => a + effLvl(f), 0) / nonCrop.length : 0;
    const EARLY = ROLE !== 'RESOURCE_START' && avgNC < EARLY_FIELDS_UNTIL;
    if (FOCUS) free = { ...free, field: false };
    const res = {};
    const done = { field: !free.field, building: !free.building || blockedB };

    // 1) Sandėlis / svirnas pilnas – kelti pirmiausia
    if (!done.building) {
      const emergencies = [
        { key: 'WAREHOUSE', full: Math.max(have[0], have[1], have[2]) >= caps.w * STORAGE_LIMIT },
        { key: 'GRANARY', full: have[3] >= caps.g * STORAGE_LIMIT },
      ];
      for (const e of emergencies) {
        if (!e.full) continue;
        const info = bInfo(builds, B[e.key].gid);
        const k = 'EMERG_' + e.key;
        if (info.slot && !info.uc && info.eff < MAX_STORAGE_LEVEL && !isSkipped(k)) {
          res.building = { lane: 'building', kind: 'upgrade', slot: info.slot, gid: B[e.key].gid, key: k, desc: `${e.key} → ${info.eff + 1} (pilnas)` };
          done.building = true;
          break;
        }
      }
    }

    // 1b) Grūdų balansas per mažas – kelti žemiausią grūdų lauką (tik pirmo kaimo starto plane, kur grūdai sąmoningai atsilieka)
    if (!FOCUS && !done.field && (PLAN === PLAN_START || ROLE === 'HAMMER') && typeof document !== 'undefined') {
      const fcEl = document.getElementById('stockBarFreeCrop');
      const fcTxt = fcEl ? fcEl.textContent.replace(/[\u200e\u200f\u202a-\u202e\u2212]/g, m => (m === '\u2212' ? '-' : '')).replace(/[^\d-]/g, '') : '';
      const fc = fcTxt === '' ? null : parseInt(fcTxt, 10);
      // Grūdų gamyba pagal laukų lygius (įskaitant statomus) – santykis su kitų žaliavų vidurkiu
      const prod = [0, 0, 0, 0];
      for (const f of fields) prod[f.gid - 1] += FIELD_PROD[Math.min(effLvl(f), 20)] || 0;
      const avgOther = (prod[0] + prod[1] + prod[2]) / 3;
      const lowRatio = ROLE === 'HAMMER' ? (avgOther > 0 && prod[3] < HAMMER_CROP_RATIO * avgOther)
                                         : (!RACE_MODE && avgOther > 0 && prod[3] < CROP_RATIO * avgOther);
      if ((fc !== null && !isNaN(fc) && fc < FREE_CROP_MIN) || lowRatio) {
        const ok = fields.filter(f => f.gid === 4 && !f.uc && f.good && !isSkipped('f' + f.slot)).sort((a, b) => a.lvl - b.lvl);
        if (ok.length) {
          const t = ok[0];
          res.field = { lane: 'field', kind: 'upgrade', slot: t.slot, gid: 4, key: 'f' + t.slot, desc: `grūdų laukas #${t.slot} → ${t.lvl + 1} (` + (lowRatio ? `grūdų ${Math.round(100 * prod[3] / avgOther)} % kitų` : `laisvi grūdai ${fc}`) + ')' };
          done.field = true;
        }
      }
    }

    // 1c) Prieš nakties pauzę: sandėlis turi tilpti pauzės metu prigamintus resursus (~6 val.), kitaip gamyba sustos ties riba
    let nightWH = false;
    if (!FOCUS && NIGHT_PAUSE && typeof document !== 'undefined' && hoursToPauseStart() <= 8) {
      const prodNow = [...document.querySelectorAll('#production .num')].map(e => parseInt(e.textContent.replace(/[^\d-]/g, ''), 10) || 0);
      const info = bInfo(builds, B.WAREHOUSE.gid);
      if (info.slot && info.eff < MAX_STORAGE_LEVEL && [0, 1, 2].some(i => (prodNow[i] || 0) * NIGHT_STORE_H > caps.w * 0.9)) {
        nightWH = true;
        if (!done.building && !info.uc && !isSkipped('NIGHT_WH')) {
          res.building = { lane: 'building', kind: 'upgrade', slot: info.slot, gid: B.WAREHOUSE.gid, key: 'NIGHT_WH', desc: `WAREHOUSE → ${info.eff + 1} (prieš nakties pauzę)` };
          done.building = true;
        } else if (blockedB && !info.uc) { /* resursų dar nepakanka – laukiam, užpildo nekeliam */ }
      }
    }

    // 2) Planas
    // Lenktynių režime laukai negali „bėgti į priekį“: imami tik laukų žingsniai iki pirmo neįvykdyto pastato žingsnio
    let raceCut = Infinity;
    if (RACE_MODE) {
      const unfinished = [];
      PLAN.forEach((st, i) => { if (st.b && !(st.early && !EARLY_RESIDENCE) && B[st.b] && bInfo(builds, B[st.b].gid).eff < (st.b === 'MAIN' ? Math.min(st.l, mainMax()) : (st.b === 'RESIDENCE' || st.b === 'PALACE') ? Math.min(st.l, EXPANSION_MAX_LVL) : st.l)) unfinished.push(i); });   // apriboti žingsniai (Gyvenamasis, Rezidencija) neblokuoja laukų
      raceCut = unfinished.length > RACE_FIELD_AHEAD ? unfinished[RACE_FIELD_AHEAD] : Infinity;   // laukai gali bėgti keliais pastatų žingsniais pirmiau
    }
    // Romėnai stato dvi linijas vienu metu: jei laukų linijai iki lenktynių ribos nebėra darbo, antru ėjimu imami tolesni laukų žingsniai –
    // laukų linija niekada nestovi tuščia (resursų pirmenybę vis tiek lemia 60 % taisyklė)
    for (const pass of [0, 1]) {
    if (pass === 1 && !(ROMAN && !done.field && raceCut !== Infinity)) break;
    for (const [si, step] of PLAN.entries()) {
      if (step.early && !EARLY_RESIDENCE) continue;
      if (step.b === 'CRANNY' && crannyOff()) continue;                 // slėptuvė griaunama dėl vietos – plane nebestatoma
      if (step.gate && !step.gate.every(g => fields.some(f => f.gid === g && effLvl(f) >= 10))) continue;   // bonus pastatas – tik kai tos žaliavos bent vienas laukas jau 10
      if (FOCUS && (step.f || step.b !== 'RESIDENCE' || eiRush())) continue;
      if ((step.b === 'RESIDENCE' || step.b === 'PALACE') && step.l > EXPANSION_MAX_LVL) continue;   // Rezidencija/Rūmai – ne aukščiau 10
      let stepL = step.l;
      if (step.b === 'MAIN') { const mm = mainMax(); if (step.l > mm && bInfo(builds, 15).eff >= mm) continue; stepL = Math.min(stepL, mm); }   // Gyvenamasis: fermose iki 10, 1–2 kaime iki 15
      if (EARLY && step.b && step.b !== 'MAIN' && step.l > EARLY_BLD_MAX) {
        const curL = B[step.b] ? bInfo(builds, B[step.b].gid).eff : 0;
        if (curL >= EARLY_BLD_MAX) continue;                           // šis žingsnis – vėliau, kai laukai pakils
        stepL = EARLY_BLD_MAX;                                          // kol kas – tik iki 5
      }
      if (pass === 0 && step.f && si > raceCut) continue;
      if (pass === 1 && !step.f) continue;
      if (done.field && done.building) break;
      if (step.f) {
        if (done.field) continue;
        const pool = (step.only ? fields.filter(f => step.only.includes(f.gid)) : fields).filter(f => !(SKIP_CROP_FIELDS && f.gid === 4));
        if (!pool.length) continue;
        const need = step.count ? Math.min(step.count, pool.length) : pool.length;
        if (pool.filter(f => effLvl(f) >= step.f).length >= need) continue;   // žingsnis jau įvykdytas
        let cand = pool.filter(f => effLvl(f) < step.f);
        if (step.count) cand.sort((a, b) => effLvl(b) - effLvl(a));            // pratęsti jau aukščiausią
        if (step.order) {
          for (const g of step.order) {
            const c = cand.filter(f => f.gid === g);
            if (c.length) { cand = c; break; }
          }
        }
        done.field = true;                                                      // eilė išspręsta: veiksmas arba laukiama resursų
        const ok = cand.filter(f => !f.uc && f.good && !isSkipped('f' + f.slot));
        if (!ok.length) { if (!ROMAN) return { wait: true, desc: `laukiama resursų laukams iki ${step.f}` }; continue; }
        // Lyginimas: pirmiausia keliamas laukas tos žaliavos, kurios sandėlyje santykinai mažiausiai (lygis – tik antras kriterijus, ±1 lygio leidžiama)
        const fill = g => have[g - 1] / ((g === 4 ? caps.g : caps.w) || 1);
        if (!step.count) ok.sort((a, b) => (Math.abs(a.lvl - b.lvl) > 1 ? a.lvl - b.lvl : 0) || (fill(a.gid) - fill(b.gid)) || (a.lvl - b.lvl));
        const t = ok[0];
        res.field = { lane: 'field', kind: 'upgrade', slot: t.slot, gid: t.gid, key: 'f' + t.slot, desc: `laukas #${t.slot} → ${t.lvl + 1}` };
      } else {
        if (done.building) continue;
        const def = B[step.b];
        if (!def) continue;
        const key = step.b + step.l;
        if (isSkipped(key)) continue;
        const info = bInfo(builds, def.gid);
        if (info.eff >= stepL) continue;
        done.building = true;
        if (info.uc) { if (!ROMAN) return { wait: true, desc: `${step.b} statoma` }; continue; }
        vset('nextPlanB', { gid: def.gid, lvl: info.eff + 1 });       // laukiamas plano pastatas – pigaus užpildo palyginimui
        if (info.slot) {
          res.building = { lane: 'building', kind: 'upgrade', slot: info.slot, gid: def.gid, key, desc: `${step.b} → ${info.eff + 1}` };
        } else {
          const slot = def.slot ? ((builds.find(x => x.slot === def.slot) || {}).gid === 0 ? def.slot : null)
                                : (builds.filter(x => x.slot <= 38 && x.gid === 0)[0] || {}).slot;
          if (!slot) { log('Nėra laisvos vietos:', step.b); vset('needSlot', Date.now()); done.building = false; continue; }
          res.building = { lane: 'building', kind: 'new', slot, gid: def.gid, cat: def.cat, key, desc: `nauja: ${step.b} (vieta ${slot})` };
        }
      }
      if (!ROMAN && (res.field || res.building)) break;
    }
    }
    if (!res.field && !res.building && !done.field && !done.building) res.complete = true;
    // EI KEPIMAS: kai grūdų balansas per mažas naujiems EI – keliam žemiausią grūdų lauką (statybos kitur – sustabdytos)
    if (eiRush() && fieldLaneFree && !res.field && typeof document !== 'undefined') {
      const fcEl = document.getElementById('stockBarFreeCrop');
      const fc = fcEl ? parseInt(clean(fcEl.textContent).replace(/[^\d-]/g, ''), 10) : 0;
      if (fc < RUSH_CROP_FC) {
        const cf = fields.filter(f => f.gid === 4 && !f.uc && !isSkipped('f' + f.slot)).sort((a, b) => a.lvl - b.lvl);
        const t = cf.find(f => f.good);
        if (t) res.field = { lane: 'field', kind: 'upgrade', slot: t.slot, gid: 4, key: 'f' + t.slot, desc: `EI kepimas: grūdų laukas #${t.slot} → ${t.lvl + 1} (balansas ${fc})` };
      }
    }
    if (FOCUS && !res.building) { res.complete = false; res.desc = eiRush() ? 'EI kepimas – statybos sustabdytos' : 'antras kaimas: laukiu resursų Rezidencijai / įsikūrėjams'; }

    // 3) Užpildas: plano pastatui (atnaujinimui) dabar nepakanka resursų – kelti pigiausią įmanomą esamą pastatą
    if (FILLER && !FOCUS && free.building && !nightWH) {
      const plannedSlot = res.building && res.building.kind === 'upgrade' ? builds.find(x => x.slot === res.building.slot) : null;
      const plannedBlocked = blockedB || (plannedSlot && !plannedSlot.good) || (!res.building && !res.complete);
      if (plannedBlocked && !(res.building && res.building.kind === 'new')) {
        // Kiti užpildai (slėptuvė, turgus…) – tik kai sandėlis ≥60 %, kitaip resursai taupomi lenktynių pastatui
        // Pirmenybė Gyvenamajam pastatui (gid 15): jis greitina visas statybas, todėl laisvas pastatų linijos laikas pirmiausia jam
        // …bet tik tiek, kiek leidžia laukai: Gyvenamasis ≤ vidutinis medienos/molio/geležies laukų lygis + MAIN_OVER_FIELDS (kitaip per brangus)
        const rf = fields.filter(f => f.gid !== 4), avgF = rf.length ? rf.reduce((a, f) => a + effLvl(f), 0) / rf.length : 0;
        const mainCap = Math.min(MAIN_FILL_MAX, Math.floor(avgF) + MAIN_OVER_FIELDS, mainMax());
        const mainB = builds.find(x => x.gid === 15 && x.good && !x.uc && x.lvl < mainCap && !isSkipped('fill' + x.slot));
        const whF = Math.max(have[0], have[1], have[2]) / (caps.w || 1);
        const fill = mainB || (whF >= LANE_SPLIT) && builds.filter(x => x.gid > 0 && x.good && !x.uc && FILLER_GIDS.includes(x.gid) && !(x.gid === 23 && crannyOff()) && x.lvl < (EARLY ? Math.min(EARLY_BLD_MAX, FILLER_MAX_LVL) : (x.gid === 17 ? MARKET_MAX : FILLER_MAX_LVL)) && !isSkipped('fill' + x.slot))
                           .sort((a, b) => a.lvl - b.lvl)[0];
        if (fill) res.building = { lane: 'building', kind: 'upgrade', slot: fill.slot, gid: fill.gid, key: 'fill' + fill.slot, desc: `užpildas: pastatas #${fill.slot} → ${fill.lvl + 1}` };
        else if (CHEAP_FILL) { const ch = cheapFill(builds, have, EARLY); if (ch) res.building = ch; }
      }
    }
    return res;
  }

  // ---------- Puslapiai ----------
  function minTimer() {
    let min = Infinity;
    document.querySelectorAll('.buildingList .timer').forEach(t => {
      const v = parseInt(t.getAttribute('value'), 10);
      if (v > 0 && v < min) min = v;
    });
    return min;
  }

  const chorePending = name => GM_getValue('chore', '') === name && Date.now() - (GM_getValue('choreTs', 0) || 0) < 120000;
  const startChore = (name, url) => {
    GM_setValue('chore', name); GM_setValue('choreTs', Date.now());
    setStatus('einu: ' + name);
    later(humanDelay(), () => { GM_setValue('choreTs', Date.now()); GM_setValue('navTs', Date.now()); location.href = url; });
  };
  const finishChore = () => { GM_setValue('chore', ''); later(rand(3, 8), () => (location.href = '/dorf1.php')); };

  // Grąžina true, jei nukreipė į kitą puslapį (nuotykiai, užduotys, kuprinė)
  // Puslapio ženklai: žvaigždutė ant herojaus (naujas lygis) ir žalias skaičius ant nuotykių mygtuko
  const heroStar = () => { const e = document.querySelector('i.levelUp'); return !!(e && e.offsetParent && /show/.test(e.className)); };
  const advBadge = () => { const e = document.querySelector('a.adventure.attention, a.adventure .attention'); return !!(e && (e.offsetParent || e.closest('a'))); };

  const questBadge = () => { const e = document.querySelector('.newQuestSpeechBubble'); return !!(e && e.offsetParent); };

  // Artėjantis puolimas į kaimą (dorf1 „Incoming troops“ – raudonas puolimas)
  function attackInMin() {
    const mv = document.querySelector('#movements');
    if (mv) {
      let best = Infinity;
      for (const tr of mv.querySelectorAll('tr')) {
        if (!tr.querySelector('img.att1, .a1')) continue;
        const t = tr.querySelector('.timer[value]');
        if (t) best = Math.min(best, (+t.getAttribute('value') || 0) / 60);
      }
      GM_setValue('attackAt', isFinite(best) ? Date.now() + best * 60000 : 0);
      return best;
    }
    const at = GM_getValue('attackAt', 0) || 0, inc = (jget('incoming', {}) || {})[DID] || 0;
    const m = Math.min(at > Date.now() ? (at - Date.now()) / 60000 : Infinity, inc > Date.now() ? (inc - Date.now()) / 60000 : Infinity);
    return m;
  }
  // Herojus NIEKUR neišeina, kai į jo kaimą žinomas artėjantis puolimas (≤ 4 val.) – jis gina kaimą
  function noteHeroHome() { try { if ([...document.querySelectorAll('#troops img.unit')].some(i => /\buhero\b/.test(i.className))) GM_setValue('heroHomeDid', String(DID)); } catch (e) {} }
  const heroHold = () => attackInMin() < 240 || (() => { const t = (jget('incoming', {}) || {})[DID]; return !!(t && t > Date.now() - 5 * 60000); })();

  // Gamybos +15 % (8 val.) per reklamą: atidaro parduotuvę ir paspaudžia VIENĄ violetinį „Activate“ (video)
  // Parduotuvės atidarymas: anglų k. buvo mygtukas „Open shop“; lietuviškame serveryje – auksinė ikona a.shop (atsidaro skirtukas „Pirkti auksinius“, reikia „Galimybės“)
  const findShopOpen = () => [...document.querySelectorAll('button')].find(b => b.offsetParent && /^\s*open shop\s*$/i.test(b.textContent)) || [...document.querySelectorAll('a.shop')].find(a => a.offsetParent);
  async function shopOptionsTab() {
    const sh = [...document.querySelectorAll('.paymentShopV5')].find(e => e.offsetParent); if (!sh) return;
    const tabs = [...sh.querySelectorAll('a.tabItem')];
    const tb = tabs.find(e => /galimyb|features|options|möglichkeit/i.test(e.textContent)) || tabs[tabs.length - 1];
    if (tb && !tb.classList.contains('active')) { tb.click(); await sleep(rand(1200, 2200)); }
  }
  function prodBonusChore() {
    if (!PROD_VIDEO || !VIDEO_BOOST || !GM_getValue('videoBoost', true)) return false;
    if (Date.now() < (GM_getValue('prodBonusNext', 0) || 0) || Date.now() < (GM_getValue('videoOffUntil', 0) || 0)) return false;
    const open = findShopOpen();
    if (!open) { GM_setValue('prodBonusNext', Date.now() + rand(30, 60) * 60000); return false; }
    GM_setValue('prodBonusNext', Date.now() + rand(40, 70) * 60000);
    runProdBonus(open);
    return true;
  }
  async function runProdBonus(open) {
    setStatus('tikrinu gamybos bonusus (+15 %)');
    await sleep(humanDelay() * 1000);
    const lt = { lumber: 'mediena', clay: 'molis', iron: 'geležis', crop: 'grūdai' };
    let done = 0;
    for (let round = 0; round < 4; round++) {                      // kaip žmogus: prisėdęs uždeda visus iš eilės
      const shopOpen = () => [...document.querySelectorAll('.paymentShopV5')].some(e => e.offsetParent);
      if (!shopOpen()) {
        const ob = findShopOpen() || (round === 0 ? open : null);
        if (!ob) break;
        ob.click();
        await sleep(rand(2500, 4000));
      }
      await shopOptionsTab();
      const boxes = [...document.querySelectorAll('.paymentShopV5 .advantagesBonusBox')].filter(b => /(lumber|clay|iron|crop)ProductionBonus/.test(b.className));
      const have = [1, 2, 3, 4].map(i => num(document.getElementById('l' + i)));
      const idx = { lumber: 0, clay: 1, iron: 2, crop: 3 };
      const kind = b => b.className.match(/(lumber|clay|iron|crop)/)[1];
      boxes.sort((a, b) => have[idx[kind(a)]] - have[idx[kind(b)]]);       // pirmiausia – trūkstamiausia žaliava
      let vb = null, which = '';
      for (const box of boxes) {
        const b = box.querySelector('.bonusVideo button.purple');             // tik video mygtukas, auksinių – niekada
        if (b && b.offsetParent && !b.disabled && !/disabled|gold/.test(b.className)) { vb = b; which = kind(box); break; }
      }
      if (!vb) break;
      vb.click();
      log('Gamybos reklama:', lt[which]);
      setStatus(`žiūrima reklama: ${lt[which]} +15 % 8 val.`);
      await sleep(rand(...VIDEO_WAIT) * 1000);
      const vd = document.querySelector('.videoFeatureVideoDialog');
      if (vd && vd.offsetParent) {
        GM_setValue('videoOffUntil', Date.now() + 2 * 3600 * 1000);
        setStatus('reklamos langas neužsidarė – reklamos išjungtos 2 val.');
        return later(rand(60, 120), () => (location.href = '/dorf1.php'));
      }
      done++;
      await sleep(rand(2000, 6000));
    }
    log(`Gamybos bonusai: aktyvuota ${done}`);
    setStatus(done ? `gamybos bonusai aktyvuoti: ${done}` : 'gamybos bonusai aktyvūs');
    await sleep(rand(1500, 3000));
    location.href = '/dorf1.php';
  }

  // Tyrimai akademijoje: pirmiausia žvalgai (Equites Legati), tada plėšikai (Equites Imperatoris)
  const RESEARCH_BY_ROLE = {
    RESOURCE_START: [
      { key: 'imperatoris', re: /Equites Imperatoris|Imperatoriaus raitelis/i, need: { 22: 5, 20: 5 } },
      { key: 'legati', re: /Equites Legati|Raitas legatas/i, need: { 22: 5, 20: 1 }, after: 'imperatoris' },
    ],
    HAMMER: [
      { key: 'imperatoris', re: /Equites Imperatoris|Imperatoriaus raitelis/i, need: { 22: 5, 20: 5 } },
      { key: 'legati', re: /Equites Legati|Raitas legatas/i, need: { 22: 5, 20: 1 }, after: 'imperatoris' },
      { key: 'imperian', re: /\bImperian\b|Imperionas/i, need: { 22: 5, 13: 1 }, after: 'imperatoris' },
    ],
    RESOURCE: [{ key: 'praetorian', re: /Praetorian|Pretorionas/i, need: { 22: 1, 13: 1 } }],
  };
  const RESEARCH = RESEARCH_BY_ROLE[ROLE] || [];
  // 1 kaimo tyrimai saugomi bendrame rakte (kaip iki šiol), kitų – atskirai kiekvienam kaimui
  const resDone = () => ROLE === 'RESOURCE_START' ? jget('researched', {}) : (JSON.parse(vget('researched', '{}') || '{}'));
  const resSave = d => ROLE === 'RESOURCE_START' ? jset('researched', d) : vset('researched', JSON.stringify(d));
  const needOk = (r, lv) => Object.entries(r.need).every(([g, l]) => (lv[g] || 0) >= l);
  function researchChore() {
    if (Date.now() < (vget('researchNext', 0) || 0)) return false;
    const done = resDone();
    const lv = vget('blv', {}) || {};
    const next = RESEARCH.find(r => !done[r.key] && (!r.after || done[r.after]) && needOk(r, lv));
    if (!next) return false;
    vset('researchNext', Date.now() + rand(30, 60) * 60000);
    startChore('research', '/build.php?gid=22');
    return true;
  }
  async function onResearch() {
    GM_setValue('chore', '');
    await sleep(rand(2500, 5000));
    const done = resDone();
    const lv = vget('blv', {}) || {};
    const page = clean(document.body.innerText);
    for (const r of RESEARCH) {
      if (done[r.key] || !needOk(r, lv) || (r.after && !done[r.after])) continue;
      const blk = [...document.querySelectorAll('.research, .information, .action, .details, .troop, .innerTroopWrapper')]
        .filter(e => r.re.test(e.textContent)).sort((a, b) => a.textContent.length - b.textContent.length)[0];
      if (!blk) {
        if (!r.re.test(page)) { done[r.key] = 1; resSave(done); log(`${r.key}: jau ištirta`); continue; }
        setStatus(`tyrimas: ${r.key} dar neprieinamas`); return finishChore();
      }
      let box = blk;
      for (let i = 0; i < 4 && box && !box.querySelector('button'); i++) box = box.parentElement;
      const btn = box && [...box.querySelectorAll('button')].find(b => /green/.test(b.className) && !b.disabled && !/disabled|gold/.test(b.className) && /research|tirti|išrasti|tyrin/i.test(b.textContent));
      if (!btn) { setStatus(`tyrimas: ${r.key} – dar negalima (resursai/reikalavimai arba vyksta kitas tyrimas)`); return finishChore(); }
      btn.click();
      log('Pradėtas tyrimas:', r.key);
      setStatus(`pradėtas tyrimas: ${r.key}`);
      vset('researchNext', Date.now() + rand(40, 90) * 60000);
      await sleep(rand(2000, 3500));
      return finishChore();
    }
    finishChore();
  }

  // ================= PLĖTIMASIS, PLĖŠIKAVIMAS, GYNYBA =================
  const ownVillageName = () => clean((document.querySelector('#sidebarBoxVillageList .listEntry.active .name') || {}).textContent || '').trim();
  const RE_EI = /(?:Equites Imperatoris|Imperatoriaus raitel\S*)/;
  const RE_LEG = /(?:Equites Legati|Rait\S* legat\S*)/;
  function homeTroops(re) {
    const t = clean((document.querySelector('#troops') || {}).innerText || '');
    const m = t.match(new RegExp('(\\d+)\\s+' + re.source, 'i'));
    return m ? +m[1] : 0;
  }
  const startChoreFast = (name, url) => {
    GM_setValue('chore', name); GM_setValue('choreTs', Date.now());
    setStatus('skubu: ' + name);
    later(rand(2, 6), () => { GM_setValue('choreTs', Date.now()); GM_setValue('navTs', Date.now()); location.href = url; });
  };

  // ---- Dienos užduotys: atidaryti langą ir paspausti „Collect rewards“, jei aktyvus ----
  function dailyChore() {
    if (Date.now() < (GM_getValue('dailyNext', 0) || 0)) return false;
    const a = [...document.querySelectorAll('a.dailyQuests')].find(x => x.offsetParent) || document.querySelector('a.dailyQuests');
    if (!a) return false;
    GM_setValue('dailyNext', Date.now() + rand(70, 130) * 60000);
    (async () => {
      setStatus('tikrinu dienos užduotis');
      await sleep(humanDelay() * 1000);
      a.click();
      await sleep(rand(2000, 3500));
      const d = [...document.querySelectorAll('.dailyQuestsDialog')].find(e => e.offsetParent);
      const btn = d && [...d.querySelectorAll('button')].find(b => /collect|atsiimti|abholen/i.test(b.textContent) && !b.disabled && !/disabled/.test(b.className));
      if (btn) { btn.click(); log('Dienos užduočių atlygis surinktas'); setStatus('dienos užduočių atlygis surinktas'); await sleep(rand(2000, 3500)); }
      location.href = '/dorf1.php';
    })();
    return true;
  }

  // ---- Šventės rotušėje (maža šventė; didelė – kai rotušė 10 ir resursų daug) ----
  const CELEBRATE = true;
  function celebrationChore() {
    const lv = vget('blv', {}) || {};
    if (!CELEBRATE || !(lv[24] >= 1) || Date.now() < (vget('celebNext', 0) || 0)) return false;
    const cp = jget('cpInfo', null);
    if (settlerSaving() && !(cp && cp.need > 0)) return false;          // taupant – tik jei dar trūksta kultūros taškų (tada šventė kaip tik reikalinga)
    vset('celebNext', Date.now() + rand(10, 20) * 60000);               // šventė – kuo anksčiau: taškai gaunami jai pasibaigus
    startChore('celebrate', '/build.php?gid=24');
    return true;
  }
  async function onCelebrate() {
    GM_setValue('chore', '');
    await sleep(rand(2500, 5000));
    const page = clean(document.body.innerText);
    if (/(celebration|šventė).{0,40}(ends|in progress|running|läuft|vyksta|baigsis)|ends in/i.test(page) && document.querySelector('.under_progress, .timer')) {
      setStatus('šventė jau vyksta'); return finishChore();
    }
    // šventės blokai su žaliu mygtuku; mažoji – pirma, didžioji – tik jei rotušė ≥10 ir resursų užtenka su atsarga
    const blocks = [...document.querySelectorAll('.research, .information, .details, .celebration, div')].filter(e => /celebration|šventė/i.test(e.textContent) && e.querySelector('button') && e.textContent.length < 1500);
    const pick = re => blocks.filter(b => re.test(b.textContent)).sort((a, b) => a.textContent.length - b.textContent.length)[0];
    const lv = vget('blv', {}) || {};
    const have = [1, 2, 3, 4].map(i => num(document.getElementById('l' + i)));
    for (const [re, name] of [[/great celebration|didžioji šventė|didelė šventė/i, 'didelė'], [/small celebration|mažoji šventė|maža šventė/i, 'maža']]) {
      if (name === 'didelė' && (lv[24] || 0) < 10) continue;
      const blk = pick(re); if (!blk) continue;
      const nums = [...blk.querySelectorAll('*')].filter(e => e.children.length === 0 && /^\s*[\d\u202a-\u202e\u200e,.]+\s*$/.test(e.textContent)).map(e => parseInt(e.textContent.replace(/\D/g, ''), 10) || 0);
      const cost = nums.slice(0, 4);
      if (cost.length === 4 && have.some((h, i) => h < cost[i] * (name === 'didelė' ? 1.3 : 1.0))) continue;
      const btn = [...blk.querySelectorAll('button')].find(b => /green/.test(b.className) && !b.disabled && !/disabled|gold/.test(b.className));
      if (!btn) continue;
      btn.click();
      log('Pradėta šventė:', name);
      setStatus(`pradėta ${name} šventė`);
      vset('celebNext', Date.now() + rand(60, 120) * 60000);
      await sleep(rand(2000, 3500));
      return finishChore();
    }
    setStatus('šventei dar trūksta resursų');
    finishChore();
  }

  // ---- Kultūros taškai (rezidencijos skirtukas „Culture points“) ----
  function cpChore() {
    const lv = vget('blv', {}) || {};
    if (!(lv[25] || lv[26]) || Date.now() < (vget('cpNext', 0) || 0)) return false;
    vset('cpNext', Date.now() + rand(90, 150) * 60000);
    startChore('cp', `/build.php?gid=${lv[25] ? 25 : 26}&s=2`);
    return true;
  }
  async function onCp() {
    GM_setValue('chore', '');
    await sleep(rand(2000, 4000));
    const t = clean(document.body.innerText).replace(/\s+/g, ' ');
    const numOf = re => parseInt(((t.match(re) || [])[1] || '').replace(/\D/g, ''), 10);
    const need = numOf(/(?:Culture points still needed|Vis dar trūksta kultūros taškų):?\s*([\d,. ]+)/i);
    const perDay = numOf(/(?:Total|Viso):?\s*([\d,. ]+)/i);
    const have = numOf(/(?:produced so far|Iki šiol sukaupti kultūros taškai):?\s*([\d,. ]+)/i);
    if (!isNaN(need) && perDay > 0) {
      jset('cpInfo', { need, perDay, have, ts: Date.now(), etaH: need / perDay * 24 });
      log(`Kultūros taškai: turima ${have}, trūksta ${need}, per dieną ${perDay} (~${Math.round(need / perDay * 24)} val.)`);
      setStatus(`kultūros taškai: trūksta ${need} (~${Math.round(need / perDay * 24)} val.)`);
    }
    finishChore();
  }
  function cpEtaH() { const c = jget('cpInfo', null); if (!c) return Infinity; return Math.max(0, c.etaH - (Date.now() - c.ts) / 3600000); }

  // ---- Įsikūrėjai (kiekvienas kaimas atskirai; kiek kaimų gali įkurti – pagal Rezidencijos/Rūmų lygį) ----
  const stGet = () => { try { return JSON.parse(vget('settlers', '') || '{}'); } catch (e) { return {}; } };
  const stSet = o => vset('settlers', JSON.stringify(o));
  // perkelti seną (bendrą) įrašą į pirmą kaimą, kad skaičius neprapultų
  if (!vget('settlers', '') && ROLE === 'RESOURCE_START') { const old = jget('settlers', null); if (old) stSet(old); }
  function expSlots(lv) {                                             // plėtros vietos: Rezidencija 10/20, Rūmai 10/15/20
    const r = lv[25] || 0, p = lv[26] || 0;
    return Math.max(r >= 20 ? 2 : r >= 10 ? 1 : 0, p >= 20 ? 3 : p >= 15 ? 2 : p >= 10 ? 1 : 0);
  }
  function settlerSlotFree(lv) { return expSlots(lv) > (vget('expUsed', 0) || 0); }
  function settlerSaving() {
    const lv = vget('blv', {}) || {};
    if (!SETTLERS || !settlerSlotFree(lv)) return false;
    const st = stGet();
    return (st.have || 0) < 3 && cpEtaH() <= SETTLER_SAVE_H;
  }
  function settlerChore() {
    const lv = vget('blv', {}) || {};
    const sg = (lv[25] || 0) >= 10 ? 25 : (lv[26] || 0) >= 10 ? 26 : 0;          // Rezidencija arba Rūmai
    if (!SETTLERS || !sg || Date.now() < (vget('settlerNext', 0) || 0)) return false;
    const st = stGet();
    const nV = allVillages().length || 1;
    // įkurtas naujas kaimas: jei šis kaimas turėjo 3 įsikūrėjus – jie sunaudoti, užimta viena plėtros vieta
    if (nV > (vget('villagesN', nV) || nV) && (st.have || 0) >= 3) { st.have = 0; stSet(st); vset('expUsed', (vget('expUsed', 0) || 0) + 1); }
    vset('villagesN', nV);
    if (!settlerSlotFree(lv)) return false;                            // šio kaimo plėtros vietos panaudotos
    if ((st.have || 0) >= 3) return false;
    if (st.cost) {
      const have = [1, 2, 3, 4].map(i => num(document.getElementById('l' + i)));
      if (have.some((h, i) => h < st.cost[i])) return false;           // dar neužtenka – taupom
    }
    vset('settlerNext', Date.now() + rand(4, 8) * 60000);
    jset('trainPlan', { unit: 't10', label: 'įsikūrėjas', exact: 1 });
    startChore('train', `/build.php?gid=${sg}&s=1`);
    return true;
  }

  // ---- Vietų naujam kaimui paieška ----
  function siteChore() {
    const lv = vget('blv', {}) || {};
    if (!SETTLERS || (lv[25] || 0) < 1 || Date.now() < (GM_getValue('siteNext', 0) || 0)) return false;
    const v = villageXY(); if (!v) return false;
    GM_setValue('siteNext', Date.now() + rand(...SITE_SCAN_EVERY) * 60000);
    startChore('siteScan', `/karte.php?x=${v.x}&y=${v.y}`);
    return true;
  }
  async function onSiteScan() {
    GM_setValue('chore', '');
    await sleep(rand(3000, 6000));
    const v = villageXY() || vget('xy', null);
    if (!v) return finishChore();
    const strip = t => String(t || '').replace(/&#x[0-9a-f]+;/gi, '').replace(/<[^>]+>/g, ' ').replace(/[‎‏‪-‮]/g, '');
    const valleys = [], oases = [];
    const seen = new Set();
    try {
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
        const pos = await api('/api/v1/map/position', { data: { x: v.x + i * 11, y: v.y + j * 9, zoomLevel: 1, ignorePositions: [] } });
        for (const t of (pos.tiles || [])) {
          const k = t.position.x + '|' + t.position.y; if (seen.has(k)) continue; seen.add(k);
          const f = (String(t.title || '').match(/\{k\.vt\}\s*\{k\.f(\d+)\}/) || [])[1];
          if (f) { valleys.push({ x: t.position.x, y: t.position.y, f: +f }); continue; }
          if (/\{k\.fo\}/.test(t.title || '')) {
            const tx = strip(t.text); let crop = 0;
            for (const m of tx.matchAll(/\{a\.r(\d)\}\s*(\d+)/g)) if (m[1] === '4') crop += +m[2];
            if (crop) oases.push({ x: t.position.x, y: t.position.y, crop });
          }
        }
        await sleep(rand(1500, 4000));
      }
    } catch (e) { log('Vietų paieškos klaida:', e && e.message); }
    const type = { 6: '15c', 1: '9c', 7: '7c', 8: '7c', 9: '7c' };
    const weight = { 6: 3, 1: 2, 7: 1, 8: 1, 9: 1 };
    const sites = valleys.filter(s => type[s.f]).map(s => {
      const near = oases.filter(o => Math.abs(o.x - s.x) <= 3 && Math.abs(o.y - s.y) <= 3).map(o => o.crop).sort((a, b) => b - a).slice(0, 3);
      const bonus = near.reduce((a, b) => a + b, 0);
      const dist = Math.hypot(s.x - v.x, s.y - v.y);
      return { x: s.x, y: s.y, type: type[s.f], bonus, dist, score: weight[s.f] * 100 + bonus - dist * 2 };
    }).sort((a, b) => b.score - a.score).slice(0, 20);
    jset('sites', { ts: Date.now(), list: sites });
    log(`Vietų paieška: slėnių ${valleys.length}, tinkamų ${sites.length}`);
    setStatus(`rasta vietų naujam kaimui: ${sites.length} (mygtukas „Vietos“)`);
    finishChore();
  }
  function showSites() {
    const old = document.getElementById('abSites'); if (old) { old.remove(); return; }
    const d = jget('sites', { list: [] });
    const box = document.createElement('div');
    box.id = 'abSites';
    box.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:100000;background:#fffaf0;color:#222;border:2px solid #357;border-radius:8px;padding:10px;max-height:75vh;overflow:auto;font:12px sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.4);min-width:460px';
    const cp = jget('cpInfo', null), st = stGet();
    box.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><b>Vietos naujam kaimui</b><button id="abSitesX" style="border:0;background:#357;color:#fff;border-radius:4px;padding:2px 8px;cursor:pointer">✕</button></div>
      <div style="color:#555;margin-bottom:6px">Kultūros taškai: ${cp ? `trūksta ${cp.need} (~${Math.round(cpEtaH())} val.)` : 'dar nežinoma'} · Įsikūrėjų: ${st.have}/3 · Grūdų oazių premija – iš laisvų oazių per ≤3 laukelius (užimtų nematyti).</div>
      <table style="border-collapse:collapse;width:100%"><tr style="background:#dde6f0"><th style="text-align:left;padding:3px">Tipas</th><th>Koord.</th><th>Atst.</th><th>Grūdų oazės</th></tr>
      ${(d.list || []).map(r => `<tr style="border-top:1px solid #dde"><td style="padding:3px;font-weight:bold">${r.type}</td><td style="text-align:center"><a href="/karte.php?x=${r.x}&y=${r.y}">${r.x}|${r.y}</a></td><td style="text-align:right">${r.dist.toFixed(1)}</td><td style="text-align:right">+${r.bonus}%</td></tr>`).join('')}
      </table><div style="color:#555;margin-top:6px">Paspaudus koordinates atsidaro žemėlapis – ten „Found new village“ (įkurti) spaudi pats.</div>`;
    document.body.appendChild(box);
    document.getElementById('abSitesX').onclick = () => box.remove();
  }

  // ---- Plėšimai ----
  // Gynėjų gynyba prieš RAITELIUS pagal vieneto numerį (u1–u10 romėnai, 11–20 germanai, 21–30 galai, 31–40 gamta,
  // 41–50 natarai, 51–60 egiptiečiai, 61–70 hunai). Reikšmės patikrintos žaidimo enciklopedijoje; nežinomi vienetai – 70.
  const UNIT_DEF_CAV = {1:50,2:35,3:25,4:10,5:50,6:105,7:75,8:10,9:30,10:80,11:5,12:60,13:30,14:5,15:40,16:75,17:80,18:10,19:40,20:80,21:50,22:20,23:10,24:40,25:55,26:165,27:105,28:10,29:50,30:80,41:50,42:10,43:75,44:10,45:50,46:80,47:150,48:10,49:50,50:40,51:20,52:40,53:20,54:10,55:50,56:150,57:95,58:10,59:50,60:80,61:30,62:10,63:10,64:15,65:70,66:40,67:90,68:10,69:30,70:80};   // TIKSLIOS reikšmės iš žaidimo enciklopedijos (/api/v1/manual/troop/N)
  const UNIT_DEF_INF = {1:35,2:65,3:40,4:20,5:65,6:80,7:30,8:60,9:40,10:80,11:20,12:35,13:30,14:10,15:100,16:50,17:30,18:60,19:60,20:80,21:40,22:35,23:20,24:25,25:115,26:60,27:30,28:45,29:50,30:80,41:35,42:30,43:90,44:10,45:80,46:140,47:120,48:45,49:50,50:40,51:30,52:55,53:50,54:20,55:110,56:120,57:30,58:55,59:50,60:80,61:40,62:30,63:20,64:30,65:80,66:60,67:30,68:55,69:40,70:80};
  // Ataskaitos nuoroda sąraše: „?id=123|abc&s=1“ (NE „build.php?id=39…&reportId=“ – tai „pakartoti puolimą“)
  const isRepHref = x => /^\?id=|\/report\?id=|[?&]id=\d+(%7C|\|)/i.test(x || '') && !/build\.php/.test(x || '');
  // Ataskaitos puslapis – parsiunčiamas vieną kartą (gynėjai, resursai, grobis, koordinatės skaitomi iš to paties)
  let repCache = new Map();
  async function repDoc(href) {
    const u = href.startsWith('?') ? '/report' + href : href;
    if (repCache.has(u)) return repCache.get(u);
    let d = null;
    try { d = new DOMParser().parseFromString(await (await fetch(u, { credentials: 'same-origin' })).text(), 'text/html'); } catch (e) {}
    repCache.set(u, d);
    return d;
  }
  // Savų kaimų koordinatės (iš šoninio sąrašo)
  const ownXYs = () => [...document.querySelectorAll('#sidebarBoxVillageList .listEntry.village')].map(e => {
    const m = clean((e.querySelector('.coordinatesGrid, .coordinates') || {}).textContent || '').replace(/\u2212/g, '-').match(/(-?\d+)\s*\|\s*(-?\d+)/);
    return m ? { x: +m[1], y: +m[2] } : null;
  }).filter(Boolean);
  // Žaidėjų kaimų ataskaitų sąraše koordinačių NĖRA (tik pavadinimas) – imamos iš ataskaitos: 1-a „karte.php?d=“ nuoroda – puolėjas, 2-a – gynėjas
  async function reportCoords(href) {
    const d = await repDoc(href); if (!d) return null;
    const ds = [...d.querySelectorAll('a[href*="karte.php?d="]')].map(a => +((a.getAttribute('href').match(/d=(\d+)/) || [])[1] || 0)).filter(Boolean);
    if (ds.length < 2) return null;
    const att = dToXY(ds[0]), def = dToXY(ds[1]), own = ownXYs();
    return { att, def, mine: own.some(o => o.x === att.x && o.y === att.y), defOwn: own.some(o => o.x === def.x && o.y === def.y) };
  }
  // Iš ataskaitos (žvalgybos ar puolimo) paimti GYNĖJŲ vienetus: dalis po „Besiginantis/Defender“, ikonų klasės uNN ir pirmoji skaičių eilutė
  async function reportDefenders(href) {
    try {
      const d = await repDoc(href); if (!d) return null;
      const box = [...d.querySelectorAll('table, div')].filter(e => /^(Besiginantis|Defender)/i.test(clean(e.textContent).trim()) && e.querySelector('[class*="unit"]'))
        .sort((a, b) => a.textContent.length - b.textContent.length)[0];
      if (!box) return null;
      const ids = [...box.querySelectorAll('[class*="unit"]')].map(e => +((String(e.className).match(/\bu(\d{1,2})\b/) || [])[1] || 0)).filter(Boolean);
      const row = [...box.querySelectorAll('tbody tr, tr')].map(tr => [...tr.querySelectorAll('td')].map(td => clean(td.textContent).trim()))
        .find(cells => cells.length >= ids.length && ids.length && cells.slice(0, ids.length).every(c => /^\d+$|^\?$/.test(c)));
      if (!ids.length || !row) return null;
      let def = 0, defInf = 0, units = 0, unknown = false;
      ids.forEach((u, i) => { const n = row[i] === '?' ? (unknown = true, 0) : +row[i]; units += n; def += n * (UNIT_DEF_CAV[u] || 70); defInf += n * (UNIT_DEF_INF[u] || 70); });
      return { def, defInf, units, unknown };
    } catch (e) { return null; }
  }
  // Mažiausias EI kiekis, kuris laimi pilną puolimą be žuvusių (arba su ≤ CLEAR_MAX_DEATHS, jei kitaip neišeina); null – neužtenka EI
  function eiForClear(def, avail, att = EI_ATTACK, extra = 0) {
    const EI_ATTACK = att;                                            // vieneto puolimas (EI 120, Imperionas 70, legionierius 40)
    const D = (def + BASE_VDEF) * CLEAR_SAFETY;                       // + bazinė kaimo gynyba (~250 pagal ataskaitas); atsarga sienai ir netikslumams
    const lossFrac = n => Math.pow(D / (n * EI_ATTACK + extra), 1.5); // pilno puolimo laimėtojo nuostolis (extra – herojaus jėga)
    // žuvusių ≈ n × (D/(n·120))^1.5 ∝ 1/√n – kuo daugiau EI, tuo mažiau žūsta. Jei kažkuris n duoda 0 – imamas mažiausias toks
    // (kiti EI lieka plėšti), kitaip – visi turimi (mažiausi nuostoliai), jei žūtų ne daugiau kaip CLEAR_MAX_DEATHS.
    for (let n = 1; n <= avail; n++) if (n * EI_ATTACK + extra > D && Math.round(n * lossFrac(n)) === 0) return { n, deaths: 0, loss: 100 * lossFrac(n) };
    if (avail * EI_ATTACK + extra > D && Math.round(avail * lossFrac(avail)) <= CLEAR_MAX_DEATHS) return { n: avail, deaths: Math.round(avail * lossFrac(avail)), loss: 100 * lossFrac(avail) };
    return null;
  }
  // Ataskaitos detalės: grobis (eilutė „Grobis“, + premija už gyvūnus) ir puolėjo nuostolis resursais („Prarasti resursai“, 1-as stulpelis)
  async function reportProfit(href) {
    try {
      const d = await repDoc(href); if (!d) return null;
      const nv = e => parseInt(clean(e.textContent).replace(/\D/g, ''), 10) || 0;
      const g = [...d.querySelectorAll('th')].find(e => /^(Grobis|Bounty)$/i.test(e.textContent.trim()));
      const loot = g ? [...g.closest('tr').querySelectorAll('.resourceWrapper .value')].slice(0, 4).reduce((a, e) => a + nv(e), 0) : 0;   // tik 4 resursai (eilutėje dar yra „nešta/talpa“)
      const l = [...d.querySelectorAll('th')].find(e => /^(Prarasti resursai|Resources lost)$/i.test(e.textContent.trim()));
      const lost = l ? nv(l.closest('tr').querySelector('td .value') || { textContent: '0' }) : 0;
      return { loot, lost };
    } catch (e) { return null; }
  }
  const REP_DETAIL_MAX = 30;                                            // tiek ataskaitų atidaroma per vieną skaitymą (likusios – kitą kartą)
  async function readRaidReports(rowsIn) {
    const raids = jget('raids', {}), seen = jget('repSeen', []);
    repCache = new Map();
    let details = 0, done = 0;
    const rows = [...rowsIn].reverse();                                  // seniausios pirma – naujesnė informacija perrašo senesnę
    for (const r of rows) {
      const txt = clean(r.textContent).replace(/[−–]/g, '-').replace(/\s+/g, ' ').trim();
      if (/oasis|oaz|Laisva oazė|Unoccupied oasis/i.test(txt)) continue;  // oazės – kita logika
      const kind = /raids|reidu/i.test(txt) ? 'raids' : /scout|ištyrė|žvalg/i.test(txt) ? 'scouts' : /attacks|atakavo|užpuolė/i.test(txt) ? 'attacks' : '';
      if (!kind) continue;
      const a = [...r.querySelectorAll('a')].map(x => x.getAttribute('href') || '').find(isRepHref);
      if (!a) continue;
      const key = 'r' + ((a.match(/id=([^&]+)/) || [])[1] || txt.slice(0, 80));   // ataskaitos id (tekstas keičiasi: „šiandien“ → „vakar“)
      if (seen.includes(key)) continue;
      if (details >= REP_DETAIL_MAX) break;                               // nepažymim „matyta“ – perskaitysim kitą kartą
      details++;
      const rc = await reportCoords(a);
      if (!rc) { log('Ataskaita: koordinačių nerasta –', key); seen.push(key); continue; }
      seen.push(key);
      if (!rc.mine || rc.defOwn) continue;                                // ne mūsų puolimas (mus puola) arba savas kaimas
      done++;
      const m = [null, kind, rc.def.x, rc.def.y];
      const repTs = reportTs(txt) || Date.now();
      const k = m[2] + '|' + m[3];
      const st = raids[k] || { good: 0, bad: 0 };
      const ic = r.querySelector('.iReport');
      let res = ic ? +((String(ic.className).match(/iReport(\d+)/) || [])[1] || 0) : 0;
      if (res === 15) res = 1; else if (res === 16) res = 2; else if (res === 17) res = 3;   // žvalgybos ataskaitų ikonos
      if (m[1] === 'raids' || m[1] === 'attacks') st.stockTs = 0;     // po puolimo resursų likutis nežinomas – prieš kitą reidą reikia naujos žvalgybos
      if (res === 1) { st.good++; if (m[1] === 'attacks') { st.clear = false; st.cleared = Date.now(); st.def = 0; } }
      else if (res === 2 && m[1] === 'scouts') { st.bad++; st.block = Date.now() + 24 * 3600000; }
      else if (res === 2) {
        // Laimėta su nuostoliais = taikinys turi gynėjų. Strategija: vieną kartą „numušti defą“ (pilnas puolimas), paskui siurbti.
        // Vertinam KAUPIAMĄ pelną per taikinį (ne vieno reido): jei per kelis reidus grobis ≥ RAID_PROFIT_RATIO × nuostoliai – tęsiam.
        const pr = await reportProfit(a);
        if (pr) {
          st.lootSum = (st.lootSum || 0) + pr.loot; st.lostSum = (st.lostSum || 0) + pr.lost; st.n = (st.n || 0) + 1;
          if (m[1] === 'raids' && !st.cleared) st.clear = true;                     // kitas siuntimas – valymo puolimas
          if (m[1] === 'attacks') { st.clear = false; st.cleared = Date.now(); st.def = 0; }   // valymas įvykdytas
          const ok = st.n < 3 || st.lootSum >= RAID_PROFIT_RATIO * st.lostSum;
          if (ok) st.good++; else { st.bad++; st.block = Date.now() + 12 * 3600000; }
          log(`Puolimas ${m[2]}|${m[3]}: grobis ${pr.loot}, prarasta ${pr.lost}; iš viso ${st.lootSum}/${st.lostSum} → ${ok ? (st.clear ? 'kitą kartą numušim gynybą' : 'tęsiam') : 'neapsimoka (12 val. pertrauka)'}`);
        } else st.bad++;
      }
      else if (res === 3) { st.bad += 3; st.clear = false; st.block = Date.now() + 48 * 3600000; }   // visi žuvo – gynyba per stipri
      if (st.bad >= 3 && st.bad > 2 * st.good) st.block = Date.now() + 24 * 3600000;
      if (m[1] === 'scouts' && res === 3) {                               // žvalgas žuvo (gynėjai turi žvalgų gynybos): taikinys išimamas 24 val.; po to – tik jei gyventojų nebeaugo
        const fm = jget('farms', {})[k], pop = fm && fm.hist && fm.hist.length ? (fm.hist[fm.hist.length - 1] || [0, 0])[1] : 0;
        st.scoutDead = true; st.deadPop = pop; st.deadUntil = repTs + 24 * 3600000; st.block = st.deadUntil; st.bad = Math.max(0, st.bad - 3);
        log(`Žvalgas žuvo ${k} (gyv. ${pop}): taikinys išimtas 24 val.; vėliau – tik jei populiacija neaugo`);
      }
      if (m[1] === 'scouts') {
        st.scoutRes = res;
        if (res === 1) {                                                  // žvalgyba pavyko – perskaityti gynėjus
          const dd = await reportDefenders(a);
          st.scoutDead = false;                                           // žvalgyba pavyko – ankstesnė mirtis nebesvarbi
          if (dd) {
            st.def = dd.def; st.defInf = dd.defInf; st.defUnits = dd.units; st.defTs = repTs; st.clear = dd.units > 0;
            const sk = await reportStock(a); if (sk !== null) { st.stock = sk; st.stockV = 2; st.stockTs = repTs + 59000; }
            if (sk !== null) {                                            // slėptuvės paslepia beveik viską – po 2 tokių žvalgybų iš eilės nežvalgom, kol nepasikeis gyventojų skaičius
              const fm = jget('farms', {})[k], pop = fm && fm.hist && fm.hist.length ? (fm.hist[fm.hist.length - 1] || [0, 0])[1] : 0;
              if (sk < CRANNY_LOW) { st.zeroN = (st.zeroN || 0) + 1; st.zeroPop = pop; } else st.zeroN = 0;
            }   // ataskaitos laikas – minutės tikslumu
            log(`Žvalgyba ${m[2]}|${m[3]}: gynėjų ${dd.units}, gynyba prieš raitelius ~${dd.def}${sk !== null ? `, resursų ${sk}` : ''}`);
          }
          else log(`Žvalgyba ${m[2]}|${m[3]}: gynėjų perskaityti nepavyko (ataskaitos forma kitokia)`);
        }
      }
      raids[k] = st;
    }
    jset('raids', raids); jset('repSeen', seen.slice(-600));
    if (details) log(`Ataskaitos: atidaryta ${details}, mūsų puolimų/žvalgybų ${done}`);
  }
  // Grobio dydis iš žvalgybos: siunčiam tiek EI, kad viską išneštų vienu kartu (EI neša 100); per mažai grobio – neapsimoka
  const EI_CARRY = 100, STOCK_MARGIN = 1.08, RAID_MIN_STOCK = 300, CRANNY_LOW = 300;
  const crannyBarred = (r, f) => !!(r && (r.zeroN || 0) >= 2 && (f.pop || 0) === (r.zeroPop || 0));   // slėptuvės slepia viską, kaimas nesikeičia
  // Apsimokėjimas: net be gynėjų kaimas turi ~250 bazinės gynybos – kiekvienas reidas kainuoja ~1 EI (≈1410 resursų). Pulti tik jei grobis ≥ RAID_WORTH × nuostolis
  const EI_COST = 1410, BASE_VDEF = 250, RAID_WORTH = 1.5;
  // Žvalgas žuvo: taikinys išimtas 24 val.; po to pulti/žvalgyti vėl tik jei gyventojų skaičius nepadidėjo (kyla – aktyvus žaidėjas su žvalgų gynyba – paliekam)
  // Mažiausias EI kiekis, su kuriuo reidas į šį taikinį apsimoka (0 – neapsimoka niekada)
  // DIDESNĖ GRUPĖ – MAŽIAU ŽUVUSIŲ: plėšime žūsta n·x/(1+x), x = (D/(n·puolimas))^1.5 → ∝ 1/√n; žaidimas apvalina, todėl pakankamai didelė grupė
  // dažnai nepraranda NĖ VIENO. Renkamas n, kuriam (grobis − žuvusiųjų kaina) didžiausias; lygiu atveju – mažesnis (kiti kariai lieka kitiems taikiniams)
  const raidDeaths = (n, att, def) => { const x = Math.pow(((def || 0) * CLEAR_SAFETY + BASE_VDEF) / (n * att), 1.5); return Math.round(n * x / (1 + x)); };   // BASE_VDEF – jau iš ataskaitų
  function eiRaidPlan(r, avail) {
    if (!r || !r.stock) return null;
    let best = null;
    for (let n = RAID_MIN_EI; n <= Math.min(avail, CLEAR_MAX_EI); n++) {
      if (n * EI_ATTACK <= (r.def || 0) * CLEAR_SAFETY + BASE_VDEF) continue;    // pralaimėtume
      const d = raidDeaths(n, EI_ATTACK, r.def), loot = Math.min(r.stock, n * EI_CARRY), v = loot - d * EI_COST;
      if (loot < RAID_WORTH * d * EI_COST || (!d && loot < Math.min(RAID_MIN_STOCK, r.stock))) continue;
      if (!best || v > best.v) best = { n, deaths: d, loot, v };
    }
    return best;
  }
  const eiNeedFor = r => { const p = eiRaidPlan(r, CLEAR_MAX_EI); return p ? p.n : 0; };   // kiek EI reikia geriausiam plėšimui (0 – neapsimoka)
  // PĖSTININKŲ reidas pagal žvalgybos resursus: legionierius kainuoja ~400, imperionas ~600 (EI – 1410), neša po 50.
  // Grąžina { troops, n, loot, deaths } jei apsimoka (grobis ≥ RAID_WORTH × tikėtinas nuostolis), kitaip null
  function infPlan(r, imp, leg) {
    if (!r || !r.stock) return null;
    let best = null;
    for (let n = INF_MIN; n <= Math.min(imp + leg, INF_MAX); n++) {
      const a = Math.min(imp, n), l = n - a;                                // imperionai pirmiau (stipresni)
      const att = a * 70 + l * 40, D = (r.defInf || 0) * CLEAR_SAFETY + BASE_VDEF;
      if (att <= D) continue;
      const x = Math.pow(D / att, 1.5), f = x / (1 + x), dA = Math.round(a * f), dL = Math.round(l * f);   // žaidimas apvalina kiekvienam tipui
      const deaths = dA + dL, lost = dA * 600 + dL * 400, loot = Math.min(r.stock, n * 50), v = loot - lost;
      if (loot < RAID_WORTH * lost || (!deaths && loot < Math.min(RAID_MIN_STOCK, r.stock))) continue;
      if (!best || v > best.v) { const troops = {}; if (a) troops.t3 = a; if (l) troops.t1 = l; best = { troops, n, loot, deaths, v }; }
    }
    return best;
  }

  // EI kaupimas: yra vertas taikinys, bet EI namie per mažai – EI į oazes nesiunčiami, kol susikaups
  const eiHoldNow = () => { const h = (jget('eiHold', {}) || {})[DID]; return h && h.until > Date.now() ? h : null; };
  const scoutBarred = (r, f, now) => !!(r && r.scoutDead && (now < (r.deadUntil || 0) || (f.pop || 0) > (r.deadPop || 0)));
  const eiDeaths = (n, def) => { const x = Math.pow(((def || 0) + BASE_VDEF) / (n * EI_ATTACK), 1.5); return Math.max(1, n * x / (1 + x)); };
  const stockFreshFor = (r, f, now) => r && r.stock !== undefined && r.stockV === 2 && now - (r.stockTs || 0) < (isNatar(f) ? NATAR_SCOUT_H : r.stock < 500 ? 12 : 6) * 3600000 && (r.last || 0) <= (r.stockTs || 0) + 5000;   // beveik viskas slėptuvėse – žvalgom rečiau (12 val.)
  const worthRaid = (r, nMax) => !!eiRaidPlan(r, nMax);
  async function reportStock(href) {
    try {
      const d = await repDoc(href); if (!d) return null;
      const th = [...d.querySelectorAll('th')].find(e => /^(Resursai|Resources)$/i.test(e.textContent.trim())); if (!th) return null;
      // eilutė: mediena, molis, geležis, grūdai, SLĖPTUVĖ (paslėpta kiekvienos rūšies), GROBTINA (žaidimo apskaičiuota) – imam grobtiną
      const v = [...th.closest('tr').querySelectorAll('.resourceWrapper .value')].map(e => parseInt(clean(e.textContent).replace(/\D/g, ''), 10) || 0);
      if (v.length >= 6) return v[5];
      if (v.length === 5) return v.slice(0, 4).reduce((a, x) => a + Math.max(0, x - v[4]), 0);
      return v.length === 4 ? v.reduce((a, b) => a + b, 0) : null;
    } catch (e) { return null; }
  }
  const NATAR_SCOUT_H = 2;          // natarų žvalgyba galioja tik tiek valandų (jų kariai kaupiasi) – po to žvalgoma iš naujo
  const RAID_NATARS = true;         // natarų kaimai (ne Pasaulio stebuklo) – plėšimo taikiniai; žvalgyba prieš puolant, kaip ir žaidėjams
  const isNatar = f => /^Natars$/i.test((f.player || '').trim());
  // Draugai – NIEKADA nepulti: savo aljansas, jo sąjungos ir nepuolimo paktai (iš aljanso „Duomenų“), taip pat savo aljanso „sparnai“ (AFU → AFU-A, AFU-C…)
  const isMyAlly = f => {
    const my = String(GM_getValue('myAlly', '') || '').trim().toLowerCase(), tag = String(f.ally || '').trim().toLowerCase();
    if (!tag) return false;
    if (my && (tag === my || tag.startsWith(my + '-') || my.startsWith(tag + '-'))) return true;
    if (f.aid && jget('friendAids', []).includes(+f.aid)) return true;
    return jget('friendTags', []).includes(tag);
  };
  async function friendsChore() {                                        // be naršymo: aljanso puslapis per fetch, kas ~1 val.
    if (Date.now() < (GM_getValue('friendsNext', 0) || 0)) return;
    GM_setValue('friendsNext', Date.now() + rand(50, 70) * 60000);
    try {
      const h = await (await fetch('/alliance/profile', { credentials: 'same-origin' })).text();
      const d = new DOMParser().parseFromString(h, 'text/html');
      const txt = clean((d.querySelector('#content') || d.body).textContent || '').replace(/\s+/g, ' ');
      const tm = txt.match(/(?:Sutrumpinimas|Tag)\s+(\S+)/i);
      if (!tm) return;                                                    // neatpažinau (ar aljanso nėra) – paliekam, kas žinoma (saugiau)
      if (tm[1] !== GM_getValue('myAlly', '')) log('Aljansas:', GM_getValue('myAlly', '') || '–', '→', tm[1]);
      GM_setValue('myAlly', tm[1]);
      const desc = d.querySelector('.description1') || d.body;
      const html = desc.innerHTML, cut = html.search(/Kara\S*\(|War\b/i);          // sąjungos + paktai – iki „Karas su“
      const part = new DOMParser().parseFromString(cut > 0 ? html.slice(0, cut) : html, 'text/html');
      const links = [...part.querySelectorAll('a[href*="/alliance/"]')].map(a => ({ id: +((a.getAttribute('href').match(/\/alliance\/(\d+)/) || [])[1] || 0), tag: clean(a.textContent).trim().toLowerCase() })).filter(x => x.id);
      jset('friendAids', links.map(x => x.id)); jset('friendTags', links.map(x => x.tag));
      GM_setValue('friendsNote', `${tm[1]} + ${links.map(x => x.tag.toUpperCase()).join(', ') || '–'}`);
    } catch (e) { log('Aljanso draugų klaida:', e && e.message); }
  }
  const farmScore = f => (f.pop / (1 + f.dist / 10)) * (1 + Math.min(2, (f.flatH || 0) / 48)) * (f.allyFarm ? 1.5 : 1);   // ilgiau neauga / aljansiečiai jau plėšia → labiau tikėtina ferma
  // „Valymas“ su herojumi: herojus (jėga) – pagrindinė puolimo jėga; jo sveikatos nuostolis = tas pats procentas kaip kariams
  function heroPlan(def, avail, att) {
    const hAtt = GM_getValue('heroAttack', 0) || 0, health = GM_getValue('heroHealth', 0) || 0;
    if (hc().clear && heroAtHome() && !heroHold() && hAtt > 0 && health >= hc().oasisMin) {
      const p = eiForClear(def, avail, att, hAtt);
      if (p && health - p.loss >= hc().oasisKeep) return { ...p, hero: true };
    }
    return eiForClear(def, avail, att);
  }
  const scoutsOut = () => jget('scoutsOutList', []).filter(o => o.until > Date.now()).reduce((a, o) => a + o.n, 0);
  // Į šį kaimą žinomas artėjantis puolimas (bet kada) – gynėjai (legionieriai, pretorionai) niekur nesiunčiami, laukia ir gina
  const defRaidOn = () => GM_getValue('defRaid', true);                   // mygtukas „Gynėjai reiduose“
  const defHome = () => underAttack() || !defRaidOn();                    // gynėjai (legionieriai, pretorionai) lieka namie
  function underAttack() {
    if (isFinite(attackInMin())) return true;
    const t = (jget('incoming', {}) || {})[DID];
    return !!(t && t > Date.now() - 5 * 60000);
  }
  function raidChore() {
    if (!MILITARY_ROLES.includes(ROLE)) return false;
    if (/naujoko apsaug|beginner.?s protection/i.test(document.body.innerText)) { GM_setValue('raidNoTargetTs', Date.now()); return false; }   // apsaugoje žaidėjų pulti negalima
    if (!RAIDS || Date.now() < (vget('raidNext', 0) || 0)) return false;
    const ei = homeTroops(RE_EI), sc = homeTroops(RE_LEG);
    const imp = homeTroops(/(?:Imperion\S*|Imperian\S*)/), leg = defHome() ? 0 : homeTroops(/Legionier\S*|Legionnaire\S*/);   // puolimas artėja – legionieriai lieka ginti
    const inf = imp + leg;
    if (ei < RAID_MIN_EI && !sc && inf < INF_MIN) return false;
    vset('raidNext', Date.now() + rand(...RAID_EVERY) * 60000);
    const rNote = t => GM_setValue('raidNote', `${hhmm(Date.now())} ${ownVillageName()}: ${t}`);
    const v = vget('xy', null); if (!v) return false;
    const farms = jget('farms', {}), raids = jget('raids', {});
    const now = Date.now();
    const cands = Object.values(farms).map(f => ({ ...f, ...farmStatus(f), dist: Math.hypot(f.x - v.x, f.y - v.y), pop: (f.hist[f.hist.length - 1] || [0, 0])[1] }))
      .filter(f => (f.st === 'NEAKTYVUS' || f.st === 'galbūt neaktyvus' || (f.allyFarm && now - f.allyFarm < 48 * 3600000) || (RAID_NATARS && isNatar(f))) && f.pop >= RAID_MIN_POP && f.dist <= RAID_MAX_DIST && !/WW Village/i.test(f.name || ''))   // natarų kaimai – papildomas šaltinis (žvalgas pirmiau); Pasaulio stebuklo kaimų – NE
      .filter(f => !isMyAlly(f))                                                                    // savo aljanso – NIEKADA
      .filter(f => { const r = raids[f.x + '|' + f.y] || {}; return !scoutBarred(r, f, now) && !crannyBarred(r, f) && !(r.block > now || (r.scoutDead && now < (r.deadUntil || 0))) && (now - (r.last || 0) > (40 + f.dist * 4) * 60000 || (r.scouted && r.scouted === r.last && stockFreshFor(r, f, now))); })   // ką tik žvalgytą (ataskaita gauta) – pulti iškart
      // tikimybė, kad ferma: NEAKTYVUS pirmiau; tada kuo ilgiau neauga ir kuo didesnis/arčiau
      .sort((a, b) => ((b.st === 'NEAKTYVUS' || isNatar(b)) - (a.st === 'NEAKTYVUS' || isNatar(a))) || (farmScore(b) - farmScore(a)));
    // pirmas taikinys, kuriam galima ką nors daryti (žvalgyti ar pulti); kurių žvalgybos ataskaitos laukiam – praleidžiam
    let f = null, r = null, troops = null, infP = null;
    for (const c of cands) {
      const rc = raids[c.x + '|' + c.y] || { good: 0, bad: 0 };
      // natarų kariai kaupiasi (kaip gyvūnai oazėse) – žvalgyba sensta greitai: prieš kiekvieną puolimą – šviežia (≤ NATAR_SCOUT_H)
      const freshMs = (isNatar(c) ? NATAR_SCOUT_H : 24) * 3600000;
      const allyFresh = rc.ally && rc.ally.def !== null && now - rc.ally.ts < Math.min(12 * 3600000, freshMs);   // aljansiečių ataskaita – žvalgas nereikalingas
      if (!allyFresh && sc > 0 && (!(now - (rc.scouted || 0) < freshMs) || (!stockFreshFor(rc, c, now) && !(rc.scouted && now - rc.scouted < 40 * 60000)))) { f = c; r = rc; troops = { t4: 1 }; r.scouted = now; break; }   // žvalgas: kas 6 val. ir po kiekvieno puolimo (resursų likutis)
      if ((ei >= RAID_MIN_EI || inf >= INF_MIN) && !allyFresh && !stockFreshFor(rc, c, now)) continue;   // be šviežių resursų žinių – nesiunčiam
      if (stockFreshFor(rc, c, now) && !(ei >= RAID_MIN_EI && worthRaid(rc, ei))) {                // EI neapsimoka (ar per mažai) – gal pėstininkai?
        const ip = c.dist <= INF_MAX_DIST && !isNatar(c) ? infPlan(rc, imp, leg) : null;
        if (ip) { f = c; r = rc; infP = ip; break; }
        const need = eiNeedFor(rc), owned = (((jget('troopCnts', {})[DID] || {}).c) || {}).t5 || ei;
        if (need && need <= owned) {                                                                  // apsimokėtų, jei EI susikaups – laikom juos namie
          const h = jget('eiHold', {}), cur = h[DID];
          if (!cur || cur.until < now || need < cur.n) { h[DID] = { n: need, k: c.x + '|' + c.y, until: now + 45 * 60000 }; jset('eiHold', h); log(`EI kaupimas: ${c.x}|${c.y} turi ${rc.stock} resursų – reikia ${need} EI (namie ${ei}), į oazes EI nesiunčiu`); }
        }
        continue;
      }
      if (isNatar(c) && !allyFresh && !(rc.scoutRes === 1 && now - (rc.defTs || 0) < freshMs)) continue;   // natarai – be šviežios žvalgybos NEpuolam
      if (rc.scouted && rc.scoutRes === undefined && now - rc.scouted < 90 * 60000) continue;      // laukiam žvalgybos
      if (VL_ON && !GM_getValue('vlMissing@' + DID, 0) && vlSafe(c, rc, now)) continue;            // saugius (be gynėjų) plėšia Aukso klubo sąrašas „Kaimai“
      if (ei >= RAID_MIN_EI || (inf >= INF_MIN && c.dist <= INF_MAX_DIST)) { f = c; r = rc; break; }
    }
    // nėra ką daryti DABAR (taikinių nėra arba laukiam žvalgybos) – EI gali eiti į tolimesnes tuščias oazes
    if (!f) { GM_setValue('raidNoTargetTs', Date.now()); rNote(cands.length ? `taikinių ${cands.length}, laukiu žvalgybos / blokuoti (EI ${ei})` : `taikinių nėra (EI ${ei})`); return false; }
    GM_setValue('raidNoTargetTs', 0);
    const k = f.x + '|' + f.y;
    if (troops) {                                                       // žvalgas: įsiminti, kol grįš (kad nebūtų treniruojami papildomi)
      const out = jget('scoutsOutList', []).filter(o => o.until > now);
      out.push({ n: 1, until: now + (2 * f.dist / (16 * TROOP_SPEED)) * 3600000 + 10 * 60000 });
      jset('scoutsOutList', out);
      GM_setValue('repNext', Math.min(GM_getValue('repNext', 0) || 0, now + (f.dist / (16 * TROOP_SPEED)) * 3600000 + 90000));   // ataskaitas perskaityti netrukus po žvalgo atvykimo (ne po 10–20 min.)
    }
    else if (infP) {                                                      // pėstininkai pagal žvalgybos resursus (EI neapsimokėjo)
      troops = infP.troops;
      log(`Taikinys ${k}: resursų ${r.stock} → siunčiu ${infP.n} pėstininkų (${Object.entries(troops).map(([u, n]) => n + (u === 't1' ? ' legion.' : ' imperion.')).join(', ')}), grobis ~${infP.loot}, žus ~${infP.deaths.toFixed(1)}`);
    }
    else if (ei >= RAID_MIN_EI && worthRaid(r, ei)) {
      if (!r.scouted && !(r.ally && r.ally.def !== null) && SCOUT_FIRST) { return false; }   // be žvalgybos (savo ar aljanso) nepuolam
      const stockFresh = r.stock !== undefined && r.stockV === 2 && now - (r.stockTs || 0) < (isNatar(f) ? NATAR_SCOUT_H : 6) * 3600000;
      if (stockFresh && r.stock < RAID_MIN_STOCK && !r.clear) { r.block = now + 90 * 60000; raids[k] = r; jset('raids', raids); log(`Taikinys ${k}: resursų tik ${r.stock} – neapsimoka, pauzė 90 min`); return false; }
      const need = stockFresh ? Math.max(Math.ceil(r.stock * STOCK_MARGIN / EI_CARRY), (eiRaidPlan(r, ei) || {}).n || 0) : 0;   // išneštų viską IR žūtų kuo mažiau (didesnė grupė)
      const base = Math.min(need ? CLEAR_MAX_EI : RAID_MAX_EI, Math.max(RAID_MIN_EI, need || Math.ceil(f.pop / 25)));
      if (r.def > 0 && now - (r.defTs || 0) < (isNatar(f) ? NATAR_SCOUT_H : 24) * 3600000) {
        // žinoma gynyba iš žvalgybos: mažiausias EI kiekis, kuris laimi be (ar beveik be) nuostolių; neužtenka – laukiam daugiau EI
        const plan = heroPlan(r.def, Math.min(ei, CLEAR_MAX_EI), EI_ATTACK);
        if (!plan) { r.block = now + 3 * 3600000; raids[k] = r; jset('raids', raids); log(`Taikinys ${k}: gynyba ~${r.def}, EI per mažai (${ei}) – palauksiu`); return false; }
        if (need > plan.n) plan.n = Math.min(ei, need);
        troops = { t5: plan.n, ...(plan.hero ? { t11: 1 } : {}) }; r.clear = true;
        log(`Taikinys ${k}: gynyba ~${r.def}${need ? `, resursų ${r.stock}` : ''} → siunčiu ${plan.n} EI${plan.hero ? ' + herojų' : ''} (prognozė žus ${plan.deaths})`);
      } else troops = { t5: Math.min(ei, need ? base : r.clear ? Math.min(CLEAR_MAX_EI, base * 2) : base) };   // gynyba nežinoma
    }
    else if (inf >= INF_MIN && f.dist <= INF_MAX_DIST) {
      // PĖSTININKAI (kol EI neužtenka): pirmiausia Imperionai (puolimas 70), tada legionieriai (40); neša po 50
      if (!r.scouted && !(r.ally && r.ally.def !== null) && SCOUT_FIRST) { return false; }
      const base = Math.min(INF_MAX, Math.max(INF_MIN, Math.ceil(f.pop / 12)));
      const pickInf = n => { const a = Math.min(imp, n); return { t3: a, t1: Math.min(leg, n - a) }; };
      if (r.defInf > 0 && now - (r.defTs || 0) < 24 * 3600000) {
        const att = imp >= inf / 2 ? 70 : 40;                              // apytiksliai – pagal vyraujantį vienetą
        const plan = heroPlan(r.defInf, Math.min(inf, INF_MAX), att);
        if (!plan) { r.block = now + 3 * 3600000; raids[k] = r; jset('raids', raids); log(`Taikinys ${k}: gynyba prieš pėstininkus ~${r.defInf}, pėstininkų per mažai (${inf})`); return false; }
        troops = { ...pickInf(plan.n), ...(plan.hero ? { t11: 1 } : {}) }; r.clear = true;
        log(`Taikinys ${k}: gynyba ~${r.defInf} → siunčiu ${plan.n} pėstininkų (prognozė žus ${plan.deaths})`);
      } else troops = pickInf(Math.min(inf, base));
      for (const u in troops) if (!troops[u]) delete troops[u];
    }
    else return false;
    r.last = now; raids[k] = r; jset('raids', raids);
    if (troops.t5 || troops.t3 || troops.t1) { GM_setValue('raidEiTs', now); const h = jget('eiHold', {}); if (h[DID]) { delete h[DID]; jset('eiHold', h); } }                      // paskutinis tikras puolimas į fermą (ne žvalgas)
    vset('raidNext', Date.now() + rand(1, 3) * 60000);                  // veiksmas atliktas – kitas taikinys netrukus (EI neturi stovėti)
    rNote(`${troops.t4 && Object.keys(troops).length === 1 ? 'žvalgas' : 'plėšimas'} → ${k}${isNatar(f) ? ' (natarai)' : ''}, liko taikinių ${cands.length - 1}`);
    jset('raidTarget', { x: f.x, y: f.y, troops, name: f.name, player: f.player, attack: !!(r.clear && (troops.t5 || troops.t3 || troops.t1)) });
    startChore('raidSend', `/build.php?id=39&gid=16&tt=2&x=${f.x}&y=${f.y}`);
    return true;
  }
  // ---- Tuščių (be gyvūnų) laisvų oazių plėšimas kariais: oazė kaupia resursus, gynėjų nėra – nuostolių nėra ----
  // Kol žaidėjų fermų nėra (apsauga / nėra taikinių) – EI plėšia TOLIMESNES tuščias oazes (už legionierių zonos), po 2
  function eiIdleOasisChore() {
    if (!MILITARY_ROLES.includes(ROLE) || !EI_IDLE_OASES || Date.now() < (vget('eiOaNext', 0) || 0)) return false;
    if (attackInMin() < 30) return false;
    // žaidėjų fermos yra – EI joms; bet jei EI jau ≥ 12 min. nieko nesiunčiam į fermas (taikiniai tik žvalgomi / neapsimoka) – EI eina į oazes
    if (Date.now() - (GM_getValue('raidNoTargetTs', 0) || 0) > 30 * 60000 && Date.now() - (GM_getValue('raidEiTs', 0) || 0) < 12 * 60000) return false;
    const ei = homeTroops(RE_EI);
    if (ei < EO_MIN_TROOPS) return false;
    { const h = eiHoldNow(); if (h && ei < h.n + EO_MIN_TROOPS) { setStatus(`EI kaupiami reidui į ${h.k}: ${ei}/${h.n}`); return false; } }
    vset('eiOaNext', Date.now() + rand(4, 8) * 60000);
    const v = villageXY(); if (!v) return false;
    jset('eoTroops', { leg: 0, ei, far: true, armyLeg: defHome() ? 0 : homeTroops(/Legionier\S*|Legionnaire\S*/), imp: homeTroops(/(?:Imperion\S*|Imperian\S*)/) });
    startChore('eoScan', `/karte.php?x=${v.x}&y=${v.y}`);
    return true;
  }
  function emptyOasisChore() {                                   // sinchroninis: tik nusprendžia ir nueina į žemėlapį
    if (!MILITARY_ROLES.includes(ROLE)) return false;
    if (!EMPTY_OASIS_RAID || Date.now() < (vget('eoNext', 0) || 0)) return false;
    if (attackInMin() < 30) return false;
    const leg = defHome() ? 0 : homeTroops(/Legionier|Legionnaire/), ei0 = homeTroops(RE_EI);   // puolimas artėja – legionieriai lieka ginti
    const hold = eiHoldNow(), ei = hold && ei0 < hold.n + EO_MIN_TROOPS ? 0 : ei0;     // kaupiami reidui – EI į oazes nesiunčiami
    if (ei < EO_MIN_TROOPS && leg < EO_MIN_TROOPS) return false;
    vset('eoNext', Date.now() + rand(...EO_EVERY) * 60000);
    const v = villageXY(); if (!v) return false;
    jset('eoTroops', { leg, ei, armyLeg: leg, imp: homeTroops(/(?:Imperion\S*|Imperian\S*)/) });
    startChore('eoScan', `/karte.php?x=${v.x}&y=${v.y}`);
    return true;
  }
  // Paskutinio plėšimo grobis pagal oazę iš puolimo ataskaitų sąrašo (2 puslapiai): { "x|y": { got, cap } }
  // „šiandien, 15:06“ / „vakar, 23:10“ → laikas (ms); kitaip 0
  function reportTs(t) {
    const m = t.match(/(šiandien|vakar|today|yesterday),?\s*(\d{1,2}):(\d{2})/i); if (!m) return 0;
    const d = new Date(); d.setHours(+m[2], +m[3], 0, 0);
    if (/vakar|yesterday/i.test(m[1])) d.setDate(d.getDate() - 1);
    return d.getTime();
  }
  async function lastOasisLoot() {
    const cached = jget('oaLootCache', null);
    if (cached && Date.now() - cached.ts < 5 * 60000) return cached.m;             // ne dažniau kaip kas 5 min.
    const out = {};
    try {
      for (const p of [1, 2]) {
        const h = await (await fetch('/report/offensive?page=' + p, { credentials: 'same-origin' })).text();
        const d = new DOMParser().parseFromString(h, 'text/html');
        for (const tr of d.querySelectorAll('table tbody tr')) {
          const t = tr.innerText.replace(/[‪-‮]/g, '').replace(/[−–]/g, '-');
          if (!/oaz/i.test(t)) continue;
          const m = t.match(/\((-?\d+)\|(-?\d+)\)/); const c = tr.querySelector('[class*=carry]');
          const cm = c && (c.getAttribute('alt') || c.getAttribute('title') || '').match(/(\d+)\s*\/\s*(\d+)/);
          if (!m || !cm) continue;
          const k = (+m[1]) + '|' + (+m[2]);
          if (!out[k]) out[k] = { got: +cm[1], cap: +cm[2], ts: reportTs(t) };       // sąrašas nuo naujausių
        }
        await sleep(rand(400, 1000));
      }
    } catch (e) {}
    jset('oaLootCache', { ts: Date.now(), m: out });
    return out;
  }
  // Tolimų oazių sąrašas (tik oazių langeliai) – žemėlapis skenuojamas ne dažniau kaip kas EI_FAR_SCAN_MIN; tikslus būvis tikrinamas prieš siuntimą
  async function farTiles(v, r) {
    const c = jget('eiFarCache', null);
    if (c && c.x === v.x && c.y === v.y && c.r >= r && Date.now() - c.ts < EI_FAR_SCAN_MIN * 60000) return c.tiles;
    const wins = [];
    for (let i = -6; i <= 6; i++) for (let j = -5; j <= 5; j++) { const dx = i * 8, dy = j * 9; if (Math.hypot(dx, dy) <= r + 5) wins.push([v.x + dx, v.y + dy]); }
    const seen = new Set(), out = [];
    for (const [px, py] of wins) {
      try {
        const pp = await api('/api/v1/map/position', { data: { x: px, y: py, zoomLevel: 1, ignorePositions: [] } });
        for (const t of (pp.tiles || [])) {
          if (!/\{k\.(fo|bt)\}/.test(t.title || '')) continue;
          const k = t.position.x + '|' + t.position.y; if (seen.has(k)) continue; seen.add(k);
          out.push({ position: { x: t.position.x, y: t.position.y }, title: /\{k\.fo\}/.test(t.title) ? '{k.fo}' : '{k.bt}', text: /\{k\.animals\}/.test(String(t.text || '')) ? '{k.animals}' : '' });
        }
      } catch (e) {}
      await sleep(rand(300, 900));
    }
    if (out.length) jset('eiFarCache', { ts: Date.now(), x: v.x, y: v.y, r, tiles: out });
    log(`Tolimų oazių žemėlapis: ${wins.length} langų, ${out.length} oazių iki ${Math.round(r)} lauk.`);
    return out;
  }
  async function onEoScan() {
    GM_setValue('chore', '');
    await sleep(rand(2500, 5000));
    const tr = jget('eoTroops', { leg: 0, ei: 0 }), leg = tr.leg, ei = tr.ei;
    const useEI = ei >= EO_MIN_TROOPS;
    const v = villageXY() || vget('xy', null); if (!v) return finishChore();
    const done = jget('eoDone', {}), now = Date.now();
    // „far“ (laisvi EI): žiedas už legionierių zonos iki EI 40 min. ribos; kitaip – artimos
    const minD = tr.far ? FL_MAX_MIN / 60 * FL_SPEED_LEG : 0;
    // laisvi EI eina vis toliau: iki EI_FAR_MAX_MIN kelio (artimesnės vis tiek pirmiau – rikiuojama pagal atstumą ir grobį)
    const maxD = tr.far ? EI_FAR_MAX_MIN / 60 * FL_SPEED_EI : EO_MAX_DIST;
    // toliau (iki EI_FAR_EXT_MIN) – TIK kai visos oazės iki maxD jau plėštos / netinka, o EI dar liko
    const extD = tr.far ? EI_FAR_EXT_MIN / 60 * FL_SPEED_EI : maxD;
    let tiles = [];
    if (tr.far) tiles = await farTiles(v, extD);                 // didelė zona – iš talpyklos (žemėlapis skenuojamas kas ~1,5 val.)
    else {
      const wins = [];
      for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) { const dx = i * 8, dy = j * 9; if (Math.hypot(dx, dy) <= maxD + 5) wins.push([v.x + dx, v.y + dy]); }
      try {
        for (const [px, py] of wins) {
          const pp = await api('/api/v1/map/position', { data: { x: px, y: py, zoomLevel: 1, ignorePositions: [] } });
          tiles = tiles.concat(pp.tiles || []);
          await sleep(rand(300, 800));
        }
      } catch (e) { return finishChore(); }
    }
    const loot = useEI ? await lastOasisLoot() : {};             // paskutinio plėšimo grobis kiekvienoje oazėje (iš ataskaitų sąrašo)
    const seen = new Set();
    const sent = jget('eoSent', {});
    // pakartotinis puolimas: paskutinė banga grįžo su PILNU maišu (ataskaita naujesnė už siuntimą) – oazė tinka iškart, nelaukiant pertraukos
    const fullAgain = k => { const l = loot[k]; return !!(l && l.got >= l.cap && l.ts && l.ts > (sent[k] || 0)); };
    const keyOk = c => { const k = c.x + '|' + c.y; if (seen.has(k)) return false; seen.add(k); return !((done[k] || 0) > now) || fullAgain(k); };
    const toC = t => ({ x: t.position.x, y: t.position.y, dist: Math.hypot(t.position.x - v.x, t.position.y - v.y) });
    // eilė: artimesnės pirmiau; pilnas praeitas maišas – lyg 30 % arčiau, menkas (<30 %) – lyg dvigubai toliau
    const rank = c => { const l = loot[c.x + '|' + c.y]; return c.dist * (l ? (l.got >= l.cap ? 0.7 : l.got < 0.3 * l.cap ? 2 : 1) : 1); };
    const cands = tiles.filter(t => /\{k\.fo\}/.test(t.title || '') && !/\{k\.animals\}/.test(String(t.text || '')))
      .map(toC).filter(c => c.dist > minD && c.dist <= maxD && keyOk(c))
      .sort((a, b) => rank(a) - rank(b));
    const avail = useEI ? ei : leg;
    const send = (c, n, what) => {
      if (avail - n >= EO_MIN_TROOPS) vset(tr.far ? 'eiOaNext' : 'eoNext', Date.now() + rand(1, 3) * 60000);   // dar liko karių – netrukus kita grupė į kitą oazę
      const l = loot[c.x + '|' + c.y];
      done[c.x + '|' + c.y] = now + (l && l.got >= l.cap ? rand(...EO_COOLDOWN_FULL) : l && l.got < 0.3 * l.cap ? rand(...EO_COOLDOWN_POOR) : rand(...EO_COOLDOWN)) * 60000;   // pilnas – greičiau; menkas (kiti plėšia) – rečiau
      jset('eoDone', done);
      sent[c.x + '|' + c.y] = now;
      for (const kk of Object.keys(sent)) if (now - sent[kk] > 24 * 3600000) delete sent[kk];
      jset('eoSent', sent);
      jset('raidTarget', { x: c.x, y: c.y, troops: useEI ? { t5: n } : { t1: n }, name: what, player: 'oazė' });
      log(`${what} ${c.x}|${c.y} (${c.dist.toFixed(1)} lauk.): siunčiu ${n} ${useEI ? 'EI' : 'legionierių'}` + (l ? ` (praeitą kartą ${l.got}/${l.cap})` : ''));
      setStatus(`${what} ${c.x}|${c.y}: siunčiu ${n} ${useEI ? 'EI' : 'legion.'}`);
      startChore('raidSend', `/build.php?id=39&gid=16&tt=2&x=${c.x}&y=${c.y}`);
    };
    const tryEmpty = async (list, what) => {
      for (const c of list.slice(0, 4)) {
        await sleep(rand(800, 2000));
        const info = await tileAnimals(c.x, c.y);               // dar kartą patikrinti: laisva ir tikrai be gyvūnų
        if (!info.free || info.total > 0) { done[c.x + '|' + c.y] = now + 60 * 60000; continue; }
        // grupė pagal praeitą grobį (EI neša po 100): pilnas maišas – +1 EI (iki EO_GROUP_MAX); mažiau nei pusė – −1 (ne mažiau nei EO_GROUP); kitaip tiek pat.
        // Be to, pilnas maišas – ir pakartotinis puolimas (žr. fullAgain)
        let n = EO_GROUP;
        const lk = loot[c.x + '|' + c.y];
        if (useEI && lk && lk.cap) {
          const prevN = Math.max(1, Math.round(lk.cap / 100));
          n = lk.got >= lk.cap ? Math.min(EO_GROUP_MAX, Math.max(prevN + 1, Math.ceil(prevN * 1.5))) : lk.got < 0.5 * lk.cap ? Math.max(EO_GROUP, prevN - 1) : Math.max(EO_GROUP, prevN);
        }
        n = Math.min(n, avail);
        if (avail - n > 0 && avail - n < EO_MIN_TROOPS) n = avail;    // nepalikti vieno
        send(c, n, what);
        return true;
      }
      return false;
    };
    if (await tryEmpty(cands, 'tuščia oazė')) return;
    // Tuščių neliko – EI išvalo SILPNAS oazes (keli žvėreliai), kai prognozė – nežūsta nė vienas; po to jas plėšia ir legionierių sąrašas
    if ((useEI || (tr.armyLeg || 0) + (tr.imp || 0) > 0) && EI_CLEAR_WEAK) {
      const cagesOn = GM_getValue('cagesOn', false);
      const weak = tiles.filter(t => /\{k\.fo\}/.test(t.title || '') && /\{k\.animals\}/.test(String(t.text || '')))
        .map(toC).filter(c => c.dist <= maxD && keyOk(c)).sort((a, b) => a.dist - b.dist);
      for (const c of weak.slice(0, 3)) {
        await sleep(rand(800, 2000));
        const info = await tileAnimals(c.x, c.y);
        const k = c.x + '|' + c.y;
        if (!info.free || !info.total) { done[k] = now + 60 * 60000; continue; }
        if (cagesOn && info.animals.some(a => CAGE_ANIMALS.includes(a.u))) { done[k] = now + 3 * 3600000; continue; }   // narvų taikinys – herojui
        let D = 10, bad = false, ups = 0, DI = 10, DC = 10;
        for (const a of info.animals) { const st = ANIMALS[a.u]; if (!st) { bad = true; break; } D += a.n * Math.max(st.d[0], st.d[1]); DI += a.n * st.d[0]; DC += a.n * st.d[1]; ups += a.n * st.up; }
        const Dw = u => { const ai = (u.t1 || 0) * UNIT_ATT_R.t1 + (u.t3 || 0) * UNIT_ATT_R.t3, ac = (u.t5 || 0) * UNIT_ATT_R.t5; return ai + ac ? (DI * ai + DC * ac) / (ai + ac) : D; };   // gynyba pagal puolėjų sudėtį
        let n = 0;
        if (!bad) for (let m = Math.max(EO_GROUP, 2); m <= Math.min(avail, EI_CLEAR_WEAK_MAX); m++) {
          const x = Math.pow(DC / (m * EI_ATTACK), 1.5), lossFrac = x / (1 + x);    // plėšimo nuostolis (EI – raiteliai: gynyba nuo raitelių)
          if (m * lossFrac < 0.3) { n = m; break; }                                // praktiškai 0 žuvusių
        }
        if (n && useEI) { send(c, n, `silpna oazė (${info.total} gyv.)`); return; }
        // KARIAI BE HEROJAUS: EI + imperionai + legionieriai (pėstininkai – tik iki ARMY_MAX_MIN kelio). Premija už nukautus gyvūnus (~160 už išlaikymo vnt.)
        // į kuprinę ateina IR BE HEROJAUS (patikrinta ataskaitoje) + oazės resursai. Siunčiam, jei (grobis + premija) − žuvusių kaina ≥ ½ žuvusių kainos
        if (!bad) {
          const all = { t5: useEI ? ei : 0, t3: c.dist * 60 / (7 * TROOP_SPEED) <= ARMY_NOHERO_MIN ? (tr.imp || 0) : 0, t1: c.dist * 60 / (6 * TROOP_SPEED) <= ARMY_NOHERO_MIN ? (tr.armyLeg || 0) : 0 };   // be herojaus pėstininkai – iki 50 min.
          // trys sudėtys: visi / tik pėstininkai (pigesni žuvusieji) / tik EI – imama pelningiausia
          const combos = [all, { t5: 0, t3: all.t3, t1: all.t1 }, { t5: all.t5, t3: 0, t1: 0 }].filter(u => u.t5 + u.t3 + u.t1 > 0).filter((u, i2, arr) => arr.findIndex(o => JSON.stringify(o) === JSON.stringify(u)) === i2);
          let bestA = null;
          for (const units of combos) {
            const att = Object.entries(units).reduce((a2, [u, m]) => a2 + m * UNIT_ATT_R[u], 0), Du = Dw(units);
            if (att <= Du * OASIS_SAFETY) continue;
            const x = Math.pow(Du * OASIS_SAFETY / att, 1.5), lossFrac = x / (1 + x);
            const deaths = Object.fromEntries(Object.entries(units).map(([u, m]) => [u, Math.round(m * lossFrac)]));
            const lost = Object.entries(deaths).reduce((a2, [u, d2]) => a2 + d2 * UNIT_COST_R[u], 0);
            const carry = (units.t5 - deaths.t5) * 100 + (units.t3 - deaths.t3 + units.t1 - deaths.t1) * 50;
            const lk = loot[k], stock = lk && lk.got ? Math.max(lk.got, OASIS_STOCK_GUESS) : OASIS_STOCK_GUESS;
            const killed = 1 / (1 + Math.pow(Du / att, 1.5)), bonus = Math.round(OASIS_BONUS_PER_UP * ups * killed);
            const gain = Math.min(carry, stock) + bonus, profit = gain - lost;
            log(`Oazė ${k} (${info.total} gyv.) be herojaus: EI ${units.t5}, imper. ${units.t3}, legion. ${units.t1} – žus ${JSON.stringify(deaths)} (${lost}), grobis ~${gain - bonus} + premija ~${bonus} → ${profit >= 0.5 * lost ? 'tinka' : 'neapsimoka'}`);
            if (profit >= 0.5 * lost && (!bestA || profit > bestA.profit)) bestA = { units, profit, info };
          }
          if (bestA) {
            const troops = {}; for (const [u, m] of Object.entries(bestA.units)) if (m) troops[u] = m;
            done[k] = now + rand(...EO_COOLDOWN) * 60000; jset('eoDone', done); sent[k] = now; jset('eoSent', sent);
            jset('raidTarget', { x: c.x, y: c.y, troops, name: `oazė be herojaus (${info.total} gyv.)`, player: 'oazė' });
            setStatus(`oazė ${k}: kariai be herojaus (${info.total} gyv.), pelnas ~${Math.round(bestA.profit)}`);
            startChore('raidSend', `/build.php?id=39&gid=16&tt=2&x=${c.x}&y=${c.y}`);
            return;
          }
        }
        done[k] = now + rand(90, 150) * 60000;                                     // per stipri – herojui
      }
    }
    // Visos artimos (iki maxD) užimtos darbu, o EI dar liko – tolimesnės tuščios oazės (iki EI_FAR_EXT_MIN)
    if (useEI && tr.far && extD > maxD) {
      const ext = tiles.filter(t => /\{k\.fo\}/.test(t.title || '') && !/\{k\.animals\}/.test(String(t.text || '')))
        .map(toC).filter(c => c.dist > maxD && c.dist <= extD && keyOk(c))
        .sort((a, b) => rank(a) - rank(b));
      if (await tryEmpty(ext, 'tolima tuščia oazė')) return;
    }
    jset('eoDone', done);
    setStatus('tuščių oazių arti nėra (ar ką tik plėštos)');
    finishChore();
  }
  // ---- Aukso klubo „Fermų“ sąrašas tuščioms oazėms: prieš kiekvieną paleidimą patikrinamos visos oazės (API),
  //      su gyvūnais / užimtos – išjungiamos, vėl tuščios – įjungiamos, trūkstamos artimos – pridedamos; tada vienas „Pradžia“ ----
  function farmListChore() {
    if (!MILITARY_ROLES.includes(ROLE)) return false;
    if (!EMPTY_OASIS_RAID || Date.now() < (vget('flNext', 0) || 0)) return false;
    if (attackInMin() < 30) return false;
    if (defHome()) { setStatus(underAttack() ? 'puolimas artėja – legionierių sąrašas nesiunčiamas, gynėjai laukia' : 'gynėjai reiduose išjungti – legionierių sąrašas nesiunčiamas'); return false; }
    const leg = homeTroops(/Legionier|Legionnaire/), ei = homeTroops(RE_EI);
    // Tuščias oazes plėšia LEGIONIERIAI; EI – žaidėjų kaimams (raidChore). EI į oazes – tik jei FL_USE_EI.
    const useEI = FL_USE_EI && ei >= FL_EI.t5 && leg < FL_LEG.t1;
    if (leg < FL_LEG.t1 && !useEI) return false;
    GM_setValue('flMode', useEI ? 'ei' : 'leg');
    GM_setValue('flAvail', useEI ? ei : leg);
    vset('flNext', Date.now() + rand(...FL_EVERY) * 60000);
    startChore('flRun', '/build.php?gid=16&tt=99');
    return true;
  }
  // ===== AUKSO KLUBO SĄRAŠAS „Kaimai“: žvalgyti kaimai BE gynėjų (žaidėjų neaktyvūs ir natarai) – visi vienu „Pradžia“ =====
  // Sąrašą „Kaimai“ (kiekviename kariniame kaime) sukuri pats Susibūrimo vietoje → Fermų sąrašas, ir įdedi bent vieną taikinį.
  // Skriptas pats prideda/įjungia/išjungia taikinius: įjungti TIK tie, kurių šviežia žvalgyba rodo 0 gynėjų ir kur mūsų EI dabar nekeliauja.
  // Žvalgybą ir „gynybos numušimą“ (kai gynėjų yra) ir toliau daro paprasti plėšimai (raidChore).
  const VL_ON = true;
  const VL_NAME = /^\s*Kaimai\b/i;
  const VL_EVERY = [5, 9];
  function vlSafe(f, r, now) {
    if (!r || (r.block || 0) > now || scoutBarred(r, f, now)) return false;
    const freshMs = (isNatar(f) ? NATAR_SCOUT_H : 24) * 3600000;
    const allyOk = r.ally && r.ally.units === 0 && now - r.ally.ts < Math.min(12 * 3600000, freshMs);
    const ownOk = r.scoutRes === 1 && (r.defUnits === 0 || r.def === 0) && now - (r.defTs || 0) < freshMs && stockFreshFor(r, f, now) && worthRaid(r, 100);
    return !!(allyOk && stockFreshFor(r, f, now) && worthRaid(r, 100) || ownOk);
  }
  const vlUnits = f => { const rr = jget('raids', {})[f.x + '|' + f.y] || {}, rs = rr.stockV === 2 ? rr.stock : 0; return Math.min(CLEAR_MAX_EI, Math.max(RAID_MIN_EI, rs ? Math.ceil(rs * STOCK_MARGIN / EI_CARRY) : 0, Math.min(RAID_MAX_EI, Math.ceil((f.pop || 0) / 25)))); };
  function vlTargets(v, now) {                                          // saugūs taikiniai šiam kaimui (be atstumo/skrydžio filtrų)
    const farms = jget('farms', {}), raids = jget('raids', {});
    return Object.values(farms).map(f => ({ ...f, ...farmStatus(f), dist: Math.hypot(f.x - v.x, f.y - v.y), pop: (f.hist[f.hist.length - 1] || [0, 0])[1] }))
      .filter(f => (f.st === 'NEAKTYVUS' || f.st === 'galbūt neaktyvus' || (f.allyFarm && now - f.allyFarm < 48 * 3600000) || (RAID_NATARS && isNatar(f))) && f.pop >= RAID_MIN_POP && f.dist <= RAID_MAX_DIST && !/WW Village/i.test(f.name || '') && !isMyAlly(f))
      .filter(f => vlSafe(f, raids[f.x + '|' + f.y], now))
      .sort((a, b) => farmScore(b) - farmScore(a));
  }
  function vlChore() {
    if (!VL_ON || !MILITARY_ROLES.includes(ROLE) || Date.now() < (vget('vlNext', 0) || 0)) return false;
    if ((GM_getValue('vlMissing@' + DID, 0) || 0) > Date.now()) return false;
    if (attackInMin() < 30) return false;
    const ei = homeTroops(RE_EI);
    if (ei < RAID_MIN_EI) return false;
    vset('vlNext', Date.now() + rand(...VL_EVERY) * 60000);
    const v = vget('xy', null); if (!v) return false;
    if (!vlTargets(v, Date.now()).length) return false;
    GM_setValue('vlAvail', ei);
    startChore('vlRun', '/build.php?gid=16&tt=99');
    return true;
  }
  const vlWrapper = () => [...document.querySelectorAll('.farmListWrapper')].find(w => VL_NAME.test(clean((w.querySelector('.farmListHeader') || {}).textContent || '')));
  async function onVlRun() {
    GM_setValue('chore', '');
    await sleep(rand(3000, 5000));
    const w = vlWrapper();
    if (!w) {                                                            // sąrašo nėra – skriptas jį sukuria pats
      if (Date.now() - (vget('vlCreateTs', 0) || 0) < 30 * 60000) { GM_setValue('vlMissing@' + DID, Date.now() + 2 * 3600000); setStatus('sąrašo „Kaimai“ sukurti nepavyko – sukurk ranka'); return finishChore(); }
      vset('vlCreateTs', Date.now());
      try { const id = await flCreate('Kaimai', { t5: RAID_MIN_EI }); if (id) vset('vlListId', id); log('Sukurtas fermų sąrašas „Kaimai“', id); setStatus('sukurtas sąrašas „Kaimai“'); }
      catch (e) { log('Sąrašo „Kaimai“ kūrimo klaida:', e && e.message); GM_setValue('vlMissing@' + DID, Date.now() + 2 * 3600000); setStatus('sąrašo „Kaimai“ sukurti nepavyko – sukurk ranka'); return finishChore(); }
      GM_setValue('chore', 'vlRun'); GM_setValue('choreTs', Date.now()); GM_setValue('navTs', Date.now());
      return later(rand(2, 5), () => location.reload());
    }
    const cb = w.querySelector('input[data-farm-list-id]');
    const listId = cb ? +cb.getAttribute('data-farm-list-id') : (vget('vlListId', 0) || 0);
    if (!listId) { GM_setValue('vlMissing@' + DID, Date.now() + 2 * 3600000); setStatus('sąrašo „Kaimai“ numerio nežinau – įdėk ranka vieną taikinį'); return finishChore(); }
    GM_setValue('vlMissing@' + DID, 0); vset('vlListId', listId);
    const now = Date.now(), v = villageXY() || vget('xy', null), raids = jget('raids', {});
    const slots = [...w.querySelectorAll('tr.slot')].map(tr => {
      const m = clean(tr.textContent).replace(/\u2212/g, '-').match(/\((-?\d+)\|(-?\d+)\)/);
      const c = tr.querySelector('input[data-slot-id]');
      const si = tr.querySelector('td.lastRaid .lastRaidState');
      return m && c ? { id: +c.getAttribute('data-slot-id'), x: +m[1], y: +m[2], active: !/disabled/.test(tr.className), losses: !!(si && /withLosses|lost|defeat/i.test(si.className)) } : null;
    }).filter(Boolean);
    // nuostoliai paskutiniame sąrašo reide → gynėjų atsirado: taikinys blokuojamas, kol žvalgas vėl patikrins
    for (const sl of slots) if (sl.losses) { const k = sl.x + '|' + sl.y, r = raids[k] || { good: 0, bad: 0 }; if (!(r.block > now)) { r.block = now + 3 * 3600000; r.defTs = 0; raids[k] = r; log(`Sąrašas „Kaimai“: ${k} – nuostoliai, sustabdyta iki naujos žvalgybos`); } }
    jset('raids', raids);
    const rt = d => (2 * d / FL_SPEED_EI) * 3600000 + 5 * 60000;
    let avail = GM_getValue('vlAvail', 0) || 0;
    const chosen = [];
    for (const f of vlTargets(v, now)) {
      const r = raids[f.x + '|' + f.y] || {};
      if (r.last && now < r.last + rt(f.dist)) continue;                 // mūsų EI dar ten / grįžta
      const n = vlUnits(f);
      if (n > avail) continue;
      chosen.push({ ...f, n }); avail -= n;
    }
    try {
      const have = new Map(slots.map(sl => [sl.x + '|' + sl.y, sl]));
      const unitsOf = n => ({ t1: 0, t2: 0, t3: 0, t4: 0, t5: n, t6: 0, t7: 0, t8: 0, t9: 0, t10: 0 });
      const add = chosen.filter(c => !have.has(c.x + '|' + c.y)).map(c => ({ listId, x: c.x, y: c.y, units: unitsOf(c.n), active: true, abandoned: false }));
      if (add.length) await flApi('POST', '/api/v1/farm-list/slot', { slots: add });
      const pick = new Map(chosen.map(c => [c.x + '|' + c.y, c]));
      const upd = slots.map(sl => { const c = pick.get(sl.x + '|' + sl.y); return { id: sl.id, listId, x: sl.x, y: sl.y, units: unitsOf(c ? c.n : RAID_MIN_EI), active: !!c }; });
      if (upd.length) await flApi('PUT', '/api/v1/farm-list/slot?force', { slots: upd });
    } catch (e) { log('Sąrašo „Kaimai“ klaida:', e && e.message); setStatus('sąrašas „Kaimai“: klaida – praleidžiu'); return finishChore(); }
    GM_setValue('raidNote', `${hhmm(now)} ${ownVillageName()}: sąrašas „Kaimai“ – ${chosen.length} taikinių, EI ${chosen.reduce((a, c) => a + c.n, 0)}`);
    if (!chosen.length) { setStatus('sąrašas „Kaimai“: dabar nėra kur siųsti'); return finishChore(); }
    jset('vlChosen', chosen.map(c => c.x + '|' + c.y));
    GM_setValue('chore', 'vlStart'); GM_setValue('choreTs', Date.now()); GM_setValue('navTs', Date.now());
    later(rand(2, 5), () => location.reload());
  }
  async function onVlStart() {
    GM_setValue('chore', '');
    await sleep(rand(2500, 4500));
    const w = vlWrapper();
    const btn = w && [...w.querySelectorAll('button.startFarmList')].find(b => b.offsetParent && !b.disabled && !/disabled/.test(b.className));
    if (!btn) { setStatus('sąrašas „Kaimai“: mygtuko „Pradžia“ nėra'); return finishChore(); }
    btn.click();
    { const raids = jget('raids', {}), t = Date.now(); for (const k of jget('vlChosen', [])) { const r = raids[k] || { good: 0, bad: 0 }; r.last = t; raids[k] = r; } jset('raids', raids); }
    log('Sąrašas „Kaimai“ paleistas:', clean(btn.textContent).trim());
    setStatus(`sąrašas „Kaimai“ paleistas: ${clean(btn.textContent).trim()}`);
    await sleep(rand(2500, 4000));
    finishChore();
  }
  const flWrapper = () => [...document.querySelectorAll('.farmListWrapper')].find(w => FL_NAME.test(clean((w.querySelector('.farmListHeader') || {}).textContent || '')));
  // Fermų sąrašo sukūrimas (tas pats kvietimas, kurį daro žaidimo langas „Sukurti sąrašą“): grąžina naujo sąrašo ID
  async function flCreate(name, units) {
    const r = await fetch('/api/v1/farm-list', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ villageId: +DID, name, defaultUnits: { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t7: 0, t8: 0, t9: 0, t10: 0, ...units }, useShip: false, onlyLosses: false }) });
    if (!r.ok) throw new Error('sąrašo kūrimas ' + r.status);
    const j = await r.json().catch(() => ({}));
    return +(j.id || (j.farmList || {}).id || 0);
  }
  async function flApi(method, url, body) {
    const r = await fetch(url, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('fermų sąrašas ' + r.status);
  }
  async function onFlRun() {
    GM_setValue('chore', '');
    await sleep(rand(3000, 5000));
    const w = flWrapper();
    if (!w) {                                                            // sąrašo nėra – sukuriam patys
      if (Date.now() - (vget('flCreateTs', 0) || 0) < 30 * 60000) { setStatus('sąrašo „Tuscios oazes“ sukurti nepavyko – sukurk ranka'); return finishChore(); }
      vset('flCreateTs', Date.now());
      try { const id = await flCreate('Tuscios oazes', FL_LEG); if (id) vset('flListIdV', id); log('Sukurtas fermų sąrašas „Tuscios oazes“', id); }
      catch (e) { log('Sąrašo „Tuscios oazes“ kūrimo klaida:', e && e.message); setStatus('sąrašo „Tuscios oazes“ sukurti nepavyko – sukurk ranka'); return finishChore(); }
      GM_setValue('chore', 'flRun'); GM_setValue('choreTs', Date.now()); GM_setValue('navTs', Date.now());
      return later(rand(2, 5), () => location.reload());
    }
    const cb = w.querySelector('input[data-farm-list-id]');
    const listId = cb ? +cb.getAttribute('data-farm-list-id') : (vget('flListIdV', 0) || (ROLE === 'RESOURCE_START' ? GM_getValue('flListId', 0) : 0) || 0);
    if (!listId) { setStatus('fermų sąrašas tuščias – pirmą taikinį pridėk ranka'); return finishChore(); }
    vset('flListIdV', listId);
    const slots = [...w.querySelectorAll('tr.slot')].map(tr => {
      const m = clean(tr.textContent).match(/\((-?\d+)\|(-?\d+)\)/);
      const c = tr.querySelector('input[data-slot-id]');
      // paskutinio reido „pilnas grobio maišas“ – oazėje dar liko resursų, verta grįžti iškart
      // „Paskutinis reidas“: i.lastRaidState (attack_won_withoutLosses / …withLosses / lost), i.bounty_full|half|empty_small, laikas „HH:MM:SS“ arba „vakar“
      const lr = tr.querySelector('td.lastRaid');
      const bi = lr && lr.querySelector('.lastRaidBounty i');
      const si = lr && lr.querySelector('.lastRaidState');
      const tt = clean((lr && lr.querySelector('.lastRaidReport .value') || {}).textContent || '').trim();
      const full = !!(bi && /full/.test(bi.className));
      const partial = !!(bi && !/full/.test(bi.className));
      const losses = !!(si && /withLosses|lost|defeat/i.test(si.className));
      let lastT = 0;
      const tm = tt.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (tm) { const d = new Date(); d.setHours(+tm[1], +tm[2], +(tm[3] || 0), 0); lastT = d.getTime(); if (lastT > Date.now() + 60000) lastT -= 86400000; }
      else if (/vakar|yesterday/i.test(tt)) lastT = Date.now() - 20 * 3600000;   // tiksliai nežinoma – laikom senu
      return m && c ? { id: +c.getAttribute('data-slot-id'), x: +m[1], y: +m[2], active: !/disabled/.test(tr.className), full, partial, losses, lastT } : null;
    }).filter(Boolean);
    const mode = GM_getValue('flMode', 'leg');
    const per = mode === 'ei' ? FL_EI : FL_LEG;
    const units = { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t7: 0, t8: 0, t9: 0, t10: 0, ...per };
    const speed = mode === 'ei' ? FL_SPEED_EI : FL_SPEED_LEG;
    const maxDist = mode === 'ei' ? FL_MAX_MIN_EI / 60 * FL_SPEED_EI : FL_MAX_MIN / 60 * FL_SPEED_LEG;
    const modeChanged = GM_getValue('flLastMode', '') !== mode;
    const v = villageXY() || vget('xy', null);
    const now = Date.now();
    const uKey = Object.keys(per)[0], base = per[uKey];
    let budget = GM_getValue('flAvail', 0) || 0;                       // kiek karių namie – grupės skirtingo dydžio
    const groups = Math.floor(budget / base);
    const sizes = jget('flSize', {});
    if (!GM_getValue('flSizeX2', false)) { for (const k in sizes) sizes[k].n = Math.min(FL_SIZE_MAX, sizes[k].n * 2); GM_setValue('flSizeX2', true); jset('flSize', sizes); }   // vienkartinis: jau išmoktos grupės ×2
    // grupės dydis kiekvienai oazei pagal PASKUTINĮ reidą: pilnas maišas → ×1,5 (iki FL_SIZE_MAX); mažiau nei pusė → ×0,7 (ne mažiau base)
    const sizeOf = sl => {
      const k = sl.x + '|' + sl.y, cur = sizes[k] || { n: base, t: 0 };
      if (sl.lastT && sl.lastT > (cur.t || 0)) {
        const n = sl.full ? Math.min(FL_SIZE_MAX, Math.max(cur.n + 1, Math.ceil(cur.n * 1.5))) : sl.partial ? Math.max(base, Math.floor(cur.n * 0.7)) : cur.n;
        sizes[k] = { n, t: sl.lastT };
      }
      return (sizes[k] || cur).n;
    };
    const sent = jget('flSent', {}), bad = jget('flBad', {});
    let added = 0, on = 0, off = 0, fullN = 0;
    try {
      // 1) naujos tuščios oazės (kas ~45–75 min.) – pridedamos NEAKTYVIOS, į rotaciją įeina nuo kito karto
      if (slots.length < FL_MAX_SLOTS && now >= (GM_getValue('flScanNext', 0) || 0)) {
        GM_setValue('flScanNext', now + rand(45, 75) * 60000);
        const have = new Set(slots.map(s => s.x + '|' + s.y));
        let tiles = [];
        const wins = [];
        for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) { const dx = i * 8, dy = j * 9; if (Math.hypot(dx, dy) <= maxDist + 5) wins.push([v.x + dx, v.y + dy]); }
        for (const [px, py] of wins) {
          const pp = await api('/api/v1/map/position', { data: { x: px, y: py, zoomLevel: 1, ignorePositions: [] } });
          tiles = tiles.concat(pp.tiles || []); await sleep(rand(300, 800));
        }
        const seen = new Set();
        const cands = tiles.filter(t => /\{k\.fo\}/.test(t.title || '') && !/\{k\.animals\}/.test(String(t.text || '')))
          .map(t => ({ x: t.position.x, y: t.position.y, d: Math.hypot(t.position.x - v.x, t.position.y - v.y) }))
          .filter(c => { const k = c.x + '|' + c.y; if (seen.has(k) || have.has(k)) return false; seen.add(k); return c.d <= maxDist; })
          .sort((a, b) => a.d - b.d).slice(0, FL_MAX_SLOTS - slots.length);
        const add = cands.map(c => ({ listId, x: c.x, y: c.y, units, active: false, abandoned: false }));
        if (add.length) { await flApi('POST', '/api/v1/farm-list/slot', { slots: add }); added = add.length; }
      }
      // 2) ROTACIJA: renkamės tiek oazių, kiek turim grupių. Pirmenybė: (a) paskutinis reidas grįžo pilnu maišu,
      //    (b) seniausiai plėšta / dar niekada, (c) arčiau. Praleidžiamos: per toli, kur mūsų kariai dar keliauja, ką tik rastos su gyvūnais.
      const rt = d => (2 * d / speed) * 3600000 + 5 * 60000;           // kelionė ten ir atgal + atsarga
      // nuostoliai paskutiniame reide → 24 val. nepulti; ne pilnas maišas → FL_PARTIAL_COOLDOWN_H val. nepulti (oazė išsemta)
      for (const sl of slots) { const k = sl.x + '|' + sl.y; if (sl.losses && sl.lastT && now - sl.lastT < 24 * 3600000) bad[k] = Math.max(bad[k] || 0, sl.lastT + 24 * 3600000); }
      const lastOf = sl => Math.max(sl.lastT || 0, (sent[sl.x + '|' + sl.y] || {}).t || 0);
      const elig = slots.map(sl => ({ ...sl, k: sl.x + '|' + sl.y, d: Math.hypot(sl.x - v.x, sl.y - v.y) }))
        .filter(sl => sl.d <= maxDist && !(sent[sl.k] && now < sent[sl.k].t + rt(sl.d)) && !((bad[sl.k] || 0) > now))
        .filter(sl => !(sl.partial && now - lastOf(sl) < FL_PARTIAL_COOLDOWN_H * 3600000))
        .sort((a, b) => (b.full - a.full) || (((sent[a.k] || {}).t || 0) - ((sent[b.k] || {}).t || 0)) || (a.d - b.d));
      const chosen = [];
      for (const sl of elig) {
        if (budget < base) break;
        const n = Math.min(sizeOf(sl), budget);
        await sleep(rand(400, 1100));
        const info = await tileAnimals(sl.x, sl.y);                    // patikra prieš siunčiant: laisva ir be gyvūnų
        if (info.free && info.total === 0) { chosen.push({ ...sl, n }); budget -= n; if (sl.full) fullN++; }
        else bad[sl.k] = now + rand(30, 60) * 60000;                   // gyvūnai/užimta – kurį laiką nebandyti
      }
      jset('flBad', bad);
      jset('flSize', sizes);
      const pick = new Map(chosen.map(c => [c.id, c.n]));
      const upd = slots.filter(sl => pick.has(sl.id) || sl.active || modeChanged)       // parinktos – visada (grupės dydis galėjo pasikeisti)
        .map(sl => ({ id: sl.id, listId, x: sl.x, y: sl.y, units: pick.has(sl.id) ? { ...units, [uKey]: pick.get(sl.id) } : units, active: pick.has(sl.id) }));
      if (upd.length) await flApi('PUT', '/api/v1/farm-list/slot?force', { slots: upd });
      GM_setValue('flLastMode', mode);
      on = chosen.length; off = slots.length - on;
      jset('flChosen', chosen.map(c => ({ k: c.k, n: c.n })));
    } catch (e) { log('Fermų sąrašo klaida:', e && e.message); setStatus('fermų sąrašas: klaida – praleidžiu'); return finishChore(); }
    log(`Fermų sąrašas (${mode === 'ei' ? 'EI' : 'legionieriai'}, iki ${maxDist.toFixed(1)} lauk.): karių ${GM_getValue('flAvail', 0) || 0}, parinkta ${on} oazių (pilnu maišu ${fullN}), grupės: ${(jget('flChosen', []) || []).map(c => c.n).join(', ')}, pridėta naujų ${added}`);
    if (!on) { setStatus(`fermų sąrašas: šiuo metu nėra kur siųsti (grupių ${groups})`); return finishChore(); }
    jset('flInfo', { on, off, added, fullN });
    // puslapį perkrauti, kad mygtukas „Pradžia (n)“ matytų pakeitimus, ir tada paleisti
    GM_setValue('chore', 'flStart'); GM_setValue('choreTs', Date.now()); GM_setValue('navTs', Date.now());
    later(rand(2, 5), () => location.reload());
  }
  async function onFlStart() {
    GM_setValue('chore', '');
    await sleep(rand(2500, 4500));
    const w = flWrapper();
    const btn = w && [...w.querySelectorAll('button.startFarmList')].find(b => b.offsetParent && !b.disabled && !/disabled/.test(b.className));
    if (!btn) { setStatus('fermų sąrašas: mygtuko „Pradžia“ nėra (kariai išėję?)'); return finishChore(); }
    btn.click();
    { const sent = jget('flSent', {}), t = Date.now(); for (const c of jget('flChosen', [])) sent[c.k] = { t }; jset('flSent', sent); }
    const fi = jget('flInfo', { on: 0, off: 0 });
    log('Fermų sąrašas paleistas:', clean(btn.textContent).trim());
    setStatus(`fermų sąrašas paleistas: ${clean(btn.textContent).trim()}` + (fi.fullN ? ` (iš jų ${fi.fullN} – pakartotinai, buvo pilnas maišas)` : ''));
    await sleep(rand(2500, 4000));
    finishChore();
  }

  // ---- AUKCIONAS (sidabras): stebimų daiktų sąrašas + statymas paskutinėmis sekundėmis ----
  // Sąrašas rašomas skydelyje „Aukciono sąrašas“, po eilutę:
  //   Daikto pavadinimas = didžiausia kaina VIENAM vienetui          (pvz. „Gydomasis tepalas = 30“)
  //   * = 15%        – RADINIAI: bet kuris kitas daiktas, jei vieneto kaina ≤ 15 % jo vidutinės pardavimo kainos
  //   *max = 300     – radinio didžiausia kaina vienetui;   *min = 800 – tik daiktai, kurių vidutinė kaina ≥ tiek
  // Veikia tik su SIDABRU. Spaudžiamas TIK žalias „Statymas“; geltono mygtuko (keičia AUKSĄ į sidabrą) skriptas niekada neliečia.
  const AUC_DEFAULT = 'Gydomasis tepalas = 30\n* = 15%\n*max = 200\n*min = 800';
  const AUC_KNOWN = { 'gydomasis tepalas': 106 };
  const AUC_EVERY = [2, 3];          // kas kiek min. (turi būti < AUC_HORIZON_S, kitaip tarp patikrinimų aukcionai praslysta) peržiūrėti, ar netrukus baigiasi tinkamas aukcionas
  const AUC_HORIZON_S = 240;         // domina aukcionai, kurie baigiasi per tiek sekundžių
  const AUC_SNIPE_S = 9;             // statoma, kai liko ne daugiau tiek sekundžių
  const AUC_DAILY_MAX = 4000;        // daugiausia sidabro statymų suma per parą
  const AUC_MAX_BIDS_RUN = 5;       // daugiausia statymų per vieną apsilankymą
  const AUC_WILD_MIN_SALES = 3;      // radiniai: daikto pardavimų per paskutines 24 val. ≥ tiek (kad vidutinė kaina ką nors reikštų)
  const AUC_Q = 'query($after:String$first:Int!$sortBy:AuctionsSortBy$sortOrder:SortOrder$filter:AuctionFilter){bootstrapData{timestamp}ownPlayer{wallet{silverAmount}auctions{buy(after:$after first:$first sortBy:$sortBy sortOrder:$sortOrder filter:$filter){edges{node{amount bidsAmount finishedAt highestBidder{id name relation}identifier maxBid price item{typeId name rarity}}}}}}}';
  const aucCfg = () => {
    const named = [], wild = { frac: 0, absMax: 300, minAvg: 800 };
    String(GM_getValue('aucList', AUC_DEFAULT)).split(/\n/).forEach(l => {
      const m = l.match(/^\s*(.+?)\s*[=:]\s*(\d+)\s*%?\s*$/); if (!m) return;
      const nm = m[1].trim().toLowerCase().replace(/\s+/g, ' '), v = +m[2];
      if (nm === '*') wild.frac = v / 100;
      else if (/^\*\s*max/.test(nm)) wild.absMax = v;
      else if (/^\*\s*min/.test(nm)) wild.minAvg = v;
      else named.push({ name: nm, limit: v });
    });
    return { named, wild: wild.frac > 0 ? wild : null };
  };
  const aucParse = () => aucCfg().named;
  const aucId = (name, map) => { const d = String(name).match(/^#?(\d+)$/); return d ? +d[1] : (AUC_KNOWN[name] || map[name] || null); };
  const aucLog = msg => { const l = jget('aucLog', []); l.push(hhmm(Date.now()) + ' ' + msg); jset('aucLog', l.slice(-25)); GM_setValue('aucNote', hhmm(Date.now()) + ' ' + msg); log('Aukcionas:', msg); };
  const aucSpent = () => { const d = jget('aucDay', null); return d && d.day === new Date().toDateString() ? d.sum : 0; };
  const aucMine = n => /^(own|self|you|me|mine)$/i.test(String((n.highestBidder || {}).relation || '')) ||
    (() => { const m = (jget('aucMy', {}))[n.identifier]; return !!(m && n.price === m.price && Date.now() - m.ts < 3 * 3600000); })();
  async function aucFetch(id) {                                          // id = daikto numeris; null – visi daiktai (artimiausiai baigiantys)
    const now = Math.floor(Date.now() / 1000);
    const j = await api('/api/v1/graphql', { query: AUC_Q, variables: { sortBy: 'REMAINING_TIME', sortOrder: 'ASC', filter: { itemIds: id ? [id] : null, amount: null, rarity: null, finishAfter: now }, after: null, first: id ? 15 : 40 } });
    const d = j.data, ts = d.bootstrapData.timestamp, silver = (d.ownPlayer.wallet || {}).silverAmount || 0;
    GM_setValue('aucSilver', silver);
    const list = ((d.ownPlayer.auctions.buy || {}).edges || []).map(e => e.node)
      .map(n => ({ ...n, left: n.finishedAt - ts, minBid: n.bidsAmount ? n.price + 1 : n.price }));
    return { list, silver };
  }
  // Daikto vidutinė pardavimo kaina (talpykla 3 val.); budget.n – kiek naujų užklausų dar leidžiama (null – nėra duomenų)
  async function aucAvg(typeId, rarity, budget) {
    const key = typeId + ':' + rarity, c = jget('aucAvg', {}), now = Date.now();
    if (c[key] && now - c[key].ts < 3 * 3600000) return c[key];
    if (budget && budget.n <= 0) return null;
    if (budget) budget.n--;
    const j = await api('/api/v1/graphql', { query: 'query($itemTypeId:Int!$rarity:Rarity!){itemTypeSellingInformation(itemTypeId:$itemTypeId rarity:$rarity){averagePrice lowestPrice salesHistory}}', variables: { itemTypeId: typeId, rarity } });
    const i = (j.data || {}).itemTypeSellingInformation || {};
    const r = { avg: i.averagePrice || 0, low: i.lowestPrice || 0, sales: (i.salesHistory || []).reduce((a, b) => a + b, 0), ts: now };
    c[key] = r; jset('aucAvg', c);
    await sleep(rand(300, 700));
    return r;
  }
  // Didžiausia kaina VIENAM vienetui šiam aukcionui: pavadinimu sąraše arba „radinių“ taisyklė (0 – nepirkti)
  async function aucCapUnit(n, cfg, budget) {
    const t = (n.item || {}).typeId, map = jget('aucMap', {});
    const w = cfg.named.find(x => aucId(x.name, map) === t);
    if (w) return w.limit;
    if (!cfg.wild) return 0;
    const a = await aucAvg(t, (n.item || {}).rarity, budget);
    if (!a || !a.avg || a.avg < cfg.wild.minAvg || a.sales < AUC_WILD_MIN_SALES) return 0;
    return Math.min(cfg.wild.frac * a.avg, cfg.wild.absMax);
  }
  function aucChore() {
    const mode = GM_getValue('aucMode', 'test'); if (mode === 'off') return false;
    const t = jget('aucTarget', null);
    if (t) { jset('aucTarget', null); if (Date.now() - t.ts < 180000) { startChore('auction', t.url); return true; } }
    if (Date.now() < (GM_getValue('aucNext', 0) || 0) || attackInMin() < 15) return false;
    const cfg = aucCfg(); if (!cfg.named.length && !cfg.wild) return false;
    GM_setValue('aucNext', Date.now() + rand(...AUC_EVERY) * 60000);
    const map = jget('aucMap', {});
    if (cfg.named.some(w => !aucId(w.name, map)) && Date.now() - (GM_getValue('aucMapTry', 0) || 0) > 6 * 3600000) {   // trūksta daikto numerio – perskaityti apžvalgos sąrašą
      GM_setValue('aucMapTry', Date.now()); startChore('aucMap', '/auctions/buy'); return true;
    }
    aucPrecheck();                                                       // asinchroniškai: rezultatas – aucTarget (paimamas kitą ciklą)
    return false;
  }
  async function aucPrecheck() {
    try {
      const cfg = aucCfg(), budget = { n: 6 };
      const { list, silver } = await aucFetch(null);                     // visi daiktai, artimiausiai baigiantys
      const soon = list.filter(n => n.left >= 4 && n.left <= AUC_HORIZON_S).length;
      jset('aucLast', { ts: Date.now(), n: list.length, soon, hit: '' });
      for (const n of list) {
        if (n.left < 4 || n.left > AUC_HORIZON_S || aucMine(n) || n.minBid > silver) continue;
        const cu = await aucCapUnit(n, cfg, budget);
        if (cu && n.minBid <= cu * n.amount) { jset('aucLast', { ts: Date.now(), n: list.length, soon, hit: `${(n.item || {}).name} x${n.amount} ${n.minBid}` }); jset('aucTarget', { ts: Date.now(), url: '/auctions/buy/' + n.item.typeId, id: n.item.typeId }); return; }
      }
    } catch (e) {}
  }
  async function aucBuildMap() {
    const map = jget('aucMap', {});
    const read = () => document.querySelectorAll('tr.default').forEach(tr => {
      const id = (tr.innerHTML.match(/\bitem(\d+)\b/) || [])[1];
      const nm = clean((tr.querySelector('.itemInformation strong') || {}).textContent || '').trim().toLowerCase();
      if (id && nm) map[nm] = +id;
    });
    for (let i = 0; i < 10 && !document.querySelector('tr.default'); i++) await sleep(1000);
    read();
    let cur = 1;
    for (let k = 0; k < 20; k++) {
      const idx = b => parseInt(((b.querySelector('.pageIndex') || {}).textContent || '').trim(), 10) || 0;
      const nxt = [...document.querySelectorAll('.pagination button.page')].filter(b => idx(b) > cur).sort((a, b) => idx(a) - idx(b))[0];
      if (!nxt) break;
      cur = idx(nxt); nxt.click();
      await sleep(rand(1500, 2500)); read();
    }
    jset('aucMap', map);
    aucLog(`daiktų sąrašas perskaitytas: ${Object.keys(map).length} pavadinimų`);
    finishChore();
  }
  async function aucBid(cand, mode) {
    const per = Math.round(cand.minBid / cand.amount * 10) / 10, nm = (cand.item || {}).name || '?';
    const rows = [...document.querySelectorAll('table tbody tr')].filter(r => r.querySelector('input[name=bidAmount]'));
    // eilutė atpažįstama pagal kiekį IR likusį laiką (±5 s); kaina puslapyje gali atsilikti nuo API arba kas nors ką tik pastatė
    const rowAm = r => parseInt(((clean(r.textContent).match(/\(x(\d+)\)/) || [])[1]) || '1', 10);
    const rowPr = r => parseInt(clean((r.querySelector('.valueWrapper span') || {}).textContent || '').replace(/\D/g, ''), 10);
    const rowLeft = r => { const m = clean((r.querySelector('.timerReact') || {}).textContent || '').match(/(\d+):(\d+):(\d+)/); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : -999; };
    const row = rows.find(r => rowAm(r) === cand.amount && rowPr(r) === cand.price)
             || rows.find(r => rowAm(r) === cand.amount && Math.abs(rowLeft(r) - cand.left) <= 5);
    if (!row) { aucLog(`neradau eilutės (${nm} x${cand.amount}, ${cand.price}, liko ${cand.left} s) – praleidžiu`); return false; }
    const domPr = rowPr(row);
    if (domPr > cand.price) {                                             // puslapyje kaina jau didesnė – perskaičiuoti
      cand = { ...cand, price: domPr, minBid: domPr + 1 };
      if (cand.minBid > cand.capUnit * cand.amount) { aucLog(`kaina pakilo iki ${domPr} (${nm} x${cand.amount}) – virš ribos, nestatau`); return false; }
    }
    const inp = row.querySelector('input[name=bidAmount]'), btn = row.querySelector('form.bidInput button');
    const cls = btn ? String(btn.className) : '';
    if (!btn || /gold/.test(cls) || !/green/.test(cls)) { aucLog(`mygtukas ne žalias (sidabro nepakanka?) – nestatau, kaina ${cand.minBid}`); return false; }   // geltonas = auksas → sidabras: NIEKADA
    // Aukcionas – „antros kainos“: laimi didžiausias MAKSIMALUS statymas, mokama tik šiek tiek daugiau už antrą. Todėl statom savo ribą (ne kainą +1):
    // kitaip lyderio slaptas maksimalus statymas visada aplenkia
    const bidAmt = Math.min(Math.floor(cand.capUnit * cand.amount), +GM_getValue('aucSilver', 0) || 0, AUC_DAILY_MAX - aucSpent());   // tiksliai tavo riba
    if (bidAmt < cand.minBid) { aucLog(`paros riba ar sidabro trūksta (${bidAmt} < ${cand.minBid}) – nestatau`); return false; }
    if (mode !== 'on') { aucLog(`BANDYMAS: statyčiau iki ${bidAmt} (dabar ${cand.minBid}) už ${nm} x${cand.amount} (${per}/vnt., riba ${Math.round(cand.capUnit)}), liko ${cand.left} s, statymų ${cand.bidsAmount}`); jset('aucMy', { ...jget('aucMy', {}), [cand.identifier]: { price: cand.price, ts: Date.now() } }); return true; }
    setInput(inp, String(bidAmt)); await sleep(rand(300, 700));
    btn.click();
    await sleep(rand(1200, 2000));
    const conf = [...document.querySelectorAll('.dialogContents button, [class*=dialog] button, [class*=modal] button')].find(b => b.offsetParent && /green/.test(b.className) && !/gold|disabled/.test(b.className) && /patvirtinti|taip|statyti|statymas|gerai|confirm|ok/i.test(b.textContent));
    if (conf) { conf.click(); await sleep(rand(1000, 1800)); }
    jset('aucMy', { ...jget('aucMy', {}), [cand.identifier]: { price: cand.minBid, ts: Date.now() } });
    jset('aucDay', { day: new Date().toDateString(), sum: aucSpent() + bidAmt });
    aucLog(`pastatyta iki ${bidAmt} (${Math.round(bidAmt / cand.amount * 10) / 10}/vnt.; kaina buvo ${cand.minBid}) už ${nm} x${cand.amount}, liko ${cand.left} s${conf ? ' (patvirtinta)' : ''}`);
    return true;
  }
  async function onAuction() {
    const isMap = chorePending('aucMap'), isRun = chorePending('auction');
    if (!isMap && !isRun) return;
    GM_setValue('chore', '');
    later(8 * 60, () => { if (enabled()) location.href = '/dorf1.php'; });   // saugiklis
    await sleep(rand(2500, 4500));
    try {
      if (isMap) return await aucBuildMap();
      const id = +((location.pathname.match(/buy\/(\d+)/) || [])[1] || 0);
      if (!id) return finishChore();
      const cfg = aucCfg(), mode = GM_getValue('aucMode', 'test'), deadline = Date.now() + 5 * 60000;
      let bids = 0;
      while (Date.now() < deadline && bids < AUC_MAX_BIDS_RUN) {
        const { list, silver } = await aucFetch(id);
        let cand = null;
        for (const n of list.filter(n => n.left >= 1 && n.left <= AUC_HORIZON_S && !aucMine(n)).sort((a, b) => a.left - b.left)) {
          const cu = await aucCapUnit(n, cfg, { n: 3 });
          if (cu && n.minBid <= cu * n.amount && n.minBid <= silver) { cand = { ...n, capUnit: cu }; break; }
        }
        if (!cand) break;
        const wait = cand.left - AUC_SNIPE_S;
        if (wait > 0) { setStatus(`aukcionas: laukiu ${Math.round(wait)} s (${(cand.item || {}).name} x${cand.amount}, ${cand.price})`); await sleep(Math.min(wait, 45) * 1000); continue; }
        if (await aucBid(cand, mode)) bids++;
        await sleep(rand(1500, 3000));
      }
    } catch (e) { log('Aukciono klaida', e); }
    finishChore();
  }
  function showAuction() {
    const old = document.getElementById('abAuc'); if (old) { old.remove(); return; }
    const box = document.createElement('div');
    box.id = 'abAuc';
    box.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:100000;background:#fffaf0;color:#222;border:2px solid #357;border-radius:8px;padding:10px;max-height:80vh;overflow:auto;font:12px sans-serif;width:430px';
    const lg = jget('aucLog', []).slice(-10).reverse().map(x => `<div>${x}</div>`).join('') || 'dar nieko';
    box.innerHTML = `<div style="display:flex;justify-content:space-between;margin-bottom:6px"><b>Aukcionas (sidabras)</b><button id="abAucX" style="border:0;background:#357;color:#fff;border-radius:4px;cursor:pointer">✕</button></div>
      <div style="color:#555;margin-bottom:4px">Po eilutę: <b>daikto pavadinimas = didžiausia kaina vienam vienetui</b> (pvz. „Gydomasis tepalas = 30“).<br>
      <b>* = 15%</b> – radiniai: bet kuris daiktas, kurio vieneto kaina ≤ 15 % jo vidutinės pardavimo kainos; <b>*max = 200</b> – radinio kaina vienetui ne didesnė; <b>*min = 800</b> – tik daiktai, kurių vidutinė kaina ≥ tiek. Jei „*“ eilutės nėra – radinių nepirks.</div>
      <textarea id="abAucT" rows="7" style="width:100%;box-sizing:border-box;font:12px monospace">${GM_getValue('aucList', AUC_DEFAULT)}</textarea>
      <div style="margin:6px 0"><button id="abAucS" style="padding:3px 10px;background:#357;color:#fff;border:0;border-radius:4px;cursor:pointer">Išsaugoti</button>
      <span style="margin-left:8px;color:#555">sidabro: ${GM_getValue('aucSilver', '?')} · šiandien statyta: ${aucSpent()} / ${AUC_DAILY_MAX}</span></div>
      <div style="color:#555;margin-bottom:4px">Paskutinis patikrinimas: ${(() => { const l = jget('aucLast', null); return l ? `${hhmm(l.ts)} – aukcionų ${l.n}, baigiasi per ${AUC_HORIZON_S} s: ${l.soon}${l.hit ? ', tinka: ' + l.hit : ', tinkamų nėra'}` : 'dar nebuvo'; })()}</div>
      <div style="color:#555">Paskutiniai veiksmai:</div><div style="font-size:11px">${lg}</div>`;
    document.body.appendChild(box);
    document.getElementById('abAucX').onclick = () => box.remove();
    document.getElementById('abAucS').onclick = () => { GM_setValue('aucList', document.getElementById('abAucT').value); GM_setValue('aucNext', 0); box.remove(); };
  }

  // ---- Resursų papildymas GRANDINE: 1 kaimas remia 2-ą, 2-as – 3-ią ir t. t. (kaimai pagal įkūrimo eilę).
  //      Rėmimas sustoja, kai remiamo kaimo resursų laukai (be grūdų, vidutiniškai) pasiveja rėmėją arba pasiekia 10 ----
  const avgFieldsNC = () => { const f = readFields(document).filter(x => x.gid !== 4); return f.length ? f.reduce((a, x) => a + effLvl(x), 0) / f.length : 0; };
  function postSupplyNeed() {
    if (!SUPPLY) return;
    const f = readFields(document).filter(x => x.gid !== 4);
    if (!f.length) return;
    const avg = avgFieldsNC();
    { const a = jget('villAvgF', {}); a[DID] = { avg, ts: Date.now() }; jset('villAvgF', a); }   // kiekvieno kaimo laukų vidurkis – grandinės palyginimui
    const needs = jget('supplyNeeds', {});
    const vs = allVillages(), i = vs.indexOf(String(DID));
    const lv = vget('blv', {}) || {};
    const push = SUPPLY_PUSH && [5, 6, 7].some(g => (lv[g] || 0) >= 1) && f.some(x => effLvl(x) < 10);   // laukų spurtas (žr. SUPPLY_PUSH)
    if (!push && (i <= 0 || f.every(x => x.lvl >= 10))) { if (needs[DID]) { delete needs[DID]; jset('supplyNeeds', needs); } return; }
    const st = stockInfo(), v = villageXY();
    if (!v || !st.cw) return;
    const lo = push ? PUSH_BELOW : SUPPLY_BELOW, tg = push ? PUSH_TARGET : SUPPLY_TARGET;
    const need = (push ? [0, 1, 2, 3] : [0, 1, 2]).map(k => st.r[k] < lo ? Math.max(0, Math.round(tg * (k < 3 ? st.cw : st.cg) - st.have[k])) : 0);
    if (need.some(n => n > 0)) needs[DID] = { x: v.x, y: v.y, need, avg, push, ts: Date.now() };
    else delete needs[DID];
    jset('supplyNeeds', needs);
  }
  // ---- Slėptuvės griovimas: plano pastatui nėra laisvos vietos – Gyvenamajame pastate (≥10) griaunama žemiausio lygio slėptuvė
  //      (po vieną lygį; tik žalias „Nugriauti“, auksinio „Visiškai sugriauti“ – niekada) ----
  function demolishChore() {
    if (Date.now() - (vget('needSlot', 0) || 0) > 30 * 60000) return false;   // vietos trūko neseniai
    if (Date.now() < (vget('demNext', 0) || 0)) return false;
    if (((vget('blv', {}) || {})[15] || 0) < 10) return false;                  // griauti leidžia tik Gyvenamasis 10
    if (!((vget('blv', {}) || {})[23])) return false;                            // slėptuvių nėra
    vset('demNext', Date.now() + rand(8, 15) * 60000);
    startChore('demolish', '/build.php?gid=15');
    return true;
  }
  async function onDemolish() {
    GM_setValue('chore', '');
    await sleep(rand(2500, 4500));
    const sel = document.querySelector('select#demolish');
    const btn = document.querySelector('button#btn_demolish');
    if (!sel || !btn || btn.disabled) { setStatus('griovimas: dabar negalima (jau griaunama?)'); return finishChore(); }
    const dt = vget('demoTarget', null); vset('demoTarget', null);
    if (dt && dt.slot) {                                                      // TAVO UŽSAKYMAS: griauti konkretų pastatą
      const o = [...sel.options].find(x => String(x.value) === String(dt.slot) || new RegExp('^\\s*' + dt.slot + '\\.').test(clean(x.textContent)));
      if (!o) { setStatus(`griovimas: vietos ${dt.slot} sąraše nėra`); log('Griovimas: vietos', dt.slot, 'nerasta pasirinkime'); return finishChore(); }
      sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(rand(800, 1600));
      log('Griaunama pagal užsakymą:', clean(o.textContent).trim());
      setStatus(`griaunama (užsakymas): ${clean(o.textContent).trim()}`);
      btn.click(); await sleep(rand(2000, 3000));
      return finishChore();
    }
    const cr = [...sel.options].map(o => ({ v: o.value, t: clean(o.textContent).trim() }))
      .filter(o => /Slėptuvė|Cranny/i.test(o.t)).map(o => ({ ...o, lvl: +((o.t.match(/(\d+)\s*$/) || [])[1] || 0) }))
      .sort((a, b) => a.lvl - b.lvl);
    if (!cr.length) { setStatus('griovimas: slėptuvių nėra'); return finishChore(); }
    sel.value = cr[0].v; sel.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(rand(800, 1600));
    vset('crannyDropped', true);                                              // šiame kaime slėptuvės nebeatstatomos (ir plano žingsnis praleidžiamas)
    log('Griaunama slėptuvė (vietos trūksta plano pastatui):', cr[0].t);
    setStatus(`griaunama: ${cr[0].t} (reikia vietos plano pastatui)`);
    btn.click();
    await sleep(rand(2000, 3000));
    finishChore();
  }
  // ---- TURGUS: kas ką siunčia. Nustatymai „Turgus“ lange (GM mktCfg):
  //  prio – kaimas, į kurį VISI kiti (režimas „Auto“) siunčia perteklių; v[did] – kaimo režimas: auto / off / manual (į pasirinktą kaimą), keep % – kiek palikti sau ----
  const ownVillageList = () => [...document.querySelectorAll('#sidebarBoxVillageList .listEntry.village')].map(e => {
    const m = clean((e.querySelector('.coordinatesGrid, .coordinates') || {}).textContent || '').replace(/\u2212/g, '-').match(/(-?\d+)\s*\|\s*(-?\d+)/);
    return { did: e.getAttribute('data-did'), name: clean((e.querySelector('.name') || {}).textContent || '').trim(), x: m ? +m[1] : null, y: m ? +m[2] : null };
  }).filter(v => v.did);
  const attackSoon = (did, min) => { const t = (jget('incoming', {}) || {})[did]; return !!(t && t - Date.now() < min * 60000 && t > Date.now() - 5 * 60000); };
  function noteStock() {                                                   // kiekvieno kaimo sandėlio būklė – gavėjo vietai apskaičiuoti
    const st = stockInfo(); if (!st.cw) return;
    const a = jget('villStock', {}); a[DID] = { have: st.have, cw: st.cw, cg: st.cg, ts: Date.now() }; jset('villStock', a);
  }
  // ---- SIUNTIMO UŽSAKYMAI (lange „Turgus“): iš kaimo A į kaimą B tiksliai nurodytas kiekis; vieną kartą arba kas N val.
  //      Jei dabar tiek nėra ar netelpa į prekeivius – siunčiama, kiek galima, likutis – kitą kartą ----
  const shipOrders = () => jget('shipOrders', []) || [];
  function shipOrderChore() {
    const now = Date.now(), list = shipOrders();
    const o = list.find(x => x.from === String(DID) && (x.next || 0) <= now && x.left.some(v => v > 0));
    if (!o || now < (vget('shipNext', 0) || 0)) return false;
    const tv = ownVillageList().find(v => v.did === String(o.to));
    if (!tv || tv.x === null) return false;
    if (attackSoon(String(o.to), 60)) { setStatus(`siuntimo užsakymas: į „${tv.name}“ artėja puolimas – palauksiu`); return false; }
    const st = stockInfo(); if (!st.cw) return false;
    const can = o.left.map((l, k) => Math.max(0, Math.min(l, Math.floor(st.have[k]))));
    if (can.reduce((a, b) => a + b, 0) < Math.min(SUPPLY_MIN, o.left.reduce((a, b) => a + b, 0))) { vset('shipNext', now + rand(10, 20) * 60000); setStatus(`siuntimo užsakymas → „${tv.name}“: dar trūksta resursų`); return false; }
    vset('shipNext', now + rand(3, 6) * 60000);
    log(`Siuntimo užsakymas → „${tv.name}“: ${can.join('/')} (liko užsakyme ${o.left.join('/')})`);
    jset('supplyPlan', { did: String(o.to), x: tv.x, y: tv.y, send: can.slice(0, 3), crop: can[3], route: true, ord: o.id });
    startChore('supply', '/build.php?gid=17&t=5');
    return true;
  }
  function shipOrderSent(id, sent) {
    const list = shipOrders(), o = list.find(x => x.id === id); if (!o) return;
    o.left = o.left.map((l, k) => Math.max(0, l - (sent[k] || 0)));
    if (o.left.every(v => v <= 0)) {
      if (o.every > 0) { o.left = [...o.amt]; o.next = Date.now() + o.every * 3600000; log('Siuntimo užsakymas įvykdytas, kartosis po', o.every, 'val.'); }
      else { list.splice(list.indexOf(o), 1); log('Siuntimo užsakymas įvykdytas ir pašalintas'); }
    }
    jset('shipOrders', list);
  }
  const MKT_OVER_PCT = 0.5;          // sandėlis virš 50 %, o kaime nėra ką statyti – perteklius siunčiamas ir iš atsargų
  const MKT_BUD_CAP_H = 6;           // siuntimui skirta gamybos dalis kaupiama daugiausia tiek valandų
  function routeSend(dest, my, mc) {
    const now = Date.now();
    const tv = ownVillageList().find(v => v.did === String(dest));
    if (!tv || tv.x === null || String(dest) === String(DID)) return false;
    if (attackSoon(String(dest), 60)) { setStatus(`turgus: į „${tv.name}“ artėja puolimas – nesiunčiu`); return false; }
    const t = jget('villStock', {})[dest];
    const fill = Math.min(100, Math.max(10, +mc.fill || 90)) / 100;
    const sent = [0, 0, 0, 0];
    for (const e of jget('sentLog', [])) if (e.to === String(dest) && now - e.ts < 60 * 60000) e.amt.forEach((a, i) => (sent[i] += a || 0));
    const room = [0, 1, 2, 3].map(k => t && now - t.ts < 6 * 3600000 ? Math.max(0, Math.floor(fill * (k < 3 ? t.cw : t.cg) - t.have[k] - sent[k])) : 1e9);
    const st = stockInfo(); if (!st.cw) return false;
    const keep = Math.max(0, Math.min(100, my.keep ?? 0)) / 100, keepC = Math.max(0, Math.min(100, my.keepCrop ?? 10)) / 100;
    // „Palikti sau %“ – nuo VALANDINĖS GAMYBOS: kaimas pasilieka tiek % to, ką prigamina, likusi gamybos dalis kaupiasi siuntimui
    const prod = [...document.querySelectorAll('#production .num')].map(e => parseInt(clean(e.textContent).replace(/[^\d-]/g, ''), 10) || 0);
    if (prod.length < 4) return false;
    const share = [1 - keep, 1 - keep, 1 - keep, my.crop === false ? 0 : 1 - keepC];
    const b = vget('mktBud', null) || { r: [0, 0, 0, 0], ts: now };
    const h = Math.max(0, Math.min(now - (b.ts || now), MKT_BUD_CAP_H * 3600000)) / 3600000;
    b.r = b.r.map((v, k) => Math.min(v + Math.max(0, prod[k]) * share[k] * h, Math.max(0, prod[k]) * share[k] * MKT_BUD_CAP_H)); b.ts = now; vset('mktBud', b);
    const tres = trainReserve();                                             // rezervo kariams neliečiam
    // APSAUGA: sandėlis > MKT_OVER_PCT, o kaimas dabar nieko nestato (ir rezervas kariams jau atidėtas) – perteklius virš ribos irgi siunčiamas
    const idle = now - (vget('bIdleTs', 0) || 0) < 15 * 60000;
    const over = k => idle && (k < 3 || my.crop !== false) ? Math.max(0, Math.floor(st.have[k] - MKT_OVER_PCT * (k < 3 ? st.cw : st.cg) - tres[k])) : 0;
    const can = k => Math.max(0, Math.min(room[k], Math.max(Math.floor(b.r[k]), over(k)), Math.floor(st.have[k] - tres[k])));
    const send = [0, 1, 2].map(can);
    const crop = my.crop === false ? 0 : can(3);
    if (send.reduce((a, x) => a + x, 0) + crop < SUPPLY_MIN) { setStatus(`turgus → „${tv.name}“: kaupiama siuntimui ${b.r.map(Math.round).join('/')} (gamybos dalis)`); return false; }
    vset('supplyNext', now + rand(...SUPPLY_EVERY) * 60000);
    log(`Turgus: ${my.mode === 'manual' ? 'rankinis' : 'prioritetas'} → „${tv.name}“ ${send.join('/')} + grūdai ${crop}`);
    jset('supplyPlan', { did: String(dest), x: tv.x, y: tv.y, send, crop, route: true, bud: true });
    startChore('supply', '/build.php?gid=17&t=5');
    return true;
  }
  function showHero() {
    const old = document.getElementById('abHero'); if (old) { old.remove(); return; }
    const c = hc(), om = GM_getValue('oasisMode', 'on'), hh = GM_getValue('heroHealth', null);
    const box = document.createElement('div'); box.id = 'abHero';
    box.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:100000;background:#fffaf0;color:#222;border:2px solid #7a4;border-radius:8px;padding:10px;max-height:80vh;overflow:auto;font:12px sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.4);min-width:430px';
    const row = (lbl, inp) => `<tr style="border-top:1px solid #dde"><td style="padding:4px">${lbl}</td><td style="padding:4px">${inp}</td></tr>`;
    const numI = (id, v) => `<input id="${id}" type="number" min="0" max="100" value="${v}" style="width:55px"> %`;
    const chk = (id, v) => `<input id="${id}" type="checkbox"${v ? ' checked' : ''}>`;
    box.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><b>Karžygio nustatymai</b><button id="abHeroX" style="border:0;background:#7a4;color:#fff;border-radius:4px;padding:2px 8px;cursor:pointer">✕</button></div>
      <div style="color:#555;margin-bottom:6px">Dabartinė sveikata: ${hh === null ? 'nežinoma' : Math.round(hh) + ' %'} · Herojus niekada neišeina, kai į jo kaimą artėja puolimas.</div>
      <table style="border-collapse:collapse;width:100%">
      ${row('Oazių puolimas', `<select id="hcOm">${[['on', 'Įjungtas'], ['test', 'Bandymas'], ['off', 'Išjungtas']].map(([v, t]) => `<option value="${v}"${om === v ? ' selected' : ''}>${t}</option>`).join('')}</select>`)}
      ${row('Pulti oazes tik kai sveikata ≥', numI('hcOMin', c.oasisMin))}
      ${row('Po kovos turi likti bent', numI('hcOKeep', c.oasisKeep))}
      ${row('Didžiausias nuostolis vienoje kovoje', numI('hcOLoss', c.oasisMaxLoss))}
      ${row('Nuotykiai', chk('hcAdv', c.adv) + ' tik kai sveikata ≥ ' + numI('hcAMin', c.advMin))}
      ${row('Eina kartu su EI į „valymo“ puolimus', chk('hcClr', c.clear))}
      ${row('Siunčiamas ginti kito puolamo kaimo (su gynėjais)', chk('hcDef', c.defHelp))}
      ${row('1 % herojaus sveikatos vertė (kiek EI siųsti su herojumi į oazę)', `<input id="hcHpV" type="number" min="0" max="5000" value="${c.hpValue}" style="width:65px"> resursų`)}
      </table>
      <div style="margin-top:8px"><button id="abHeroS" style="padding:3px 10px;background:#7a4;color:#fff;border:0;border-radius:4px;cursor:pointer">Išsaugoti</button></div>`;
    document.body.appendChild(box);
    document.getElementById('abHeroX').onclick = () => box.remove();
    document.getElementById('abHeroS').onclick = () => {
      const v = id => Math.max(0, Math.min(100, parseInt(document.getElementById(id).value, 10) || 0));
      const nc = { oasisMin: v('hcOMin'), oasisKeep: v('hcOKeep'), oasisMaxLoss: v('hcOLoss'), advMin: v('hcAMin'), adv: document.getElementById('hcAdv').checked, clear: document.getElementById('hcClr').checked, defHelp: document.getElementById('hcDef').checked, hpValue: Math.max(0, Math.min(5000, parseInt(document.getElementById('hcHpV').value, 10) || 0)) };
      jset('heroCfg', nc); GM_setValue('oasisMode', document.getElementById('hcOm').value); GM_setValue('oasisNext', 0);
      log('Karžygio nustatymai:', JSON.stringify(nc), 'oazės:', GM_getValue('oasisMode'));
      box.remove(); location.reload();
    };
  }
  // ---- TAVO STATYBŲ UŽSAKYMAI (langas „Statybų užsakymai“): pirmiau už planą, vykdomi ir karo režime ----
  // { did: [ { id, type: 'up'|'new'|'demo', slot, gid, to } ] }
  const BNAME = { 1: 'Medžio kirtavietė', 2: 'Molio karjeras', 3: 'Geležies kasykla', 4: 'Grūdų laukas', 5: 'Lentpjūvė', 6: 'Plytinė', 7: 'Liejykla', 8: 'Malūnas', 9: 'Kepykla', 10: 'Sandėlis', 11: 'Klėtis', 13: 'Kalvė', 14: 'Turnyrų aikštė', 15: 'Gyvenamasis pastatas', 16: 'Susibūrimo vieta', 17: 'Turgavietė', 18: 'Ambasada', 19: 'Kareivinės', 20: 'Arklidės', 21: 'Dirbtuvės', 22: 'Akademija', 23: 'Slėptuvė', 24: 'Rotušė', 25: 'Rezidencija', 26: 'Valdovų rūmai', 27: 'Iždinė', 28: 'Prekybos rūmai', 31: 'Mūrinė siena', 34: 'Akmentašys', 37: 'Karžygio dvaras', 38: 'Didysis sandėlis', 39: 'Didžioji klėtis', 41: 'Arklių girdykla' };
  const BCAT = { 5: 3, 6: 3, 7: 3, 8: 3, 9: 3, 10: 1, 11: 1, 13: 2, 14: 2, 15: 1, 16: 2, 17: 1, 18: 1, 19: 2, 20: 2, 21: 2, 22: 2, 23: 1, 24: 1, 25: 1, 26: 1, 27: 1, 28: 1, 31: 2, 34: 1, 37: 1, 38: 1, 39: 1, 41: 2 };
  const myOrders = (did = DID) => ((jget('orders', {}) || {})[String(did)] || []);
  function setOrders(did, list) { const o = jget('orders', {}) || {}; if (list.length) o[String(did)] = list; else delete o[String(did)]; jset('orders', o); }
  // Grąžina { field, building } veiksmus pagal užsakymus (arba { demolish:true }, jei pradėtas griovimas); įvykdytus išima
  function orderAction(fields, builds, free) {
    const list = myOrders(); if (!list.length) return {};
    const out = {}, keep = [];
    const at = slot => slot <= 18 ? (fields.find(f => +f.slot === +slot) || null) : (builds.find(b => +b.slot === +slot) || null);
    for (const o of list) {
      const cur = at(o.slot), eff = cur ? cur.lvl + (cur.uc ? 1 : 0) : 0, gidNow = cur ? (cur.gid || 0) : 0;
      if (o.type === 'demo') {
        if (!cur || !gidNow || cur.lvl === 0) { log('Užsakymas įvykdytas: nugriauta vieta', o.slot); continue; }
        keep.push(o);
        if (out.demolish || Date.now() < (vget('demoNext', 0) || 0)) continue;
        if (((vget('blv', {}) || {})[15] || 0) < 10) { setStatus('griovimui reikia Gyvenamojo pastato 10 lygio'); continue; }
        vset('demoNext', Date.now() + rand(4, 7) * 60000); vset('demoTarget', { slot: o.slot });
        startChore('demolish', '/build.php?gid=15'); out.demolish = true;
        continue;
      }
      if (gidNow && gidNow !== o.gid) { keep.push(o); if (o.type === 'new') setStatus(`užsakymas: vieta ${o.slot} užimta (${BNAME[gidNow] || gidNow}) – pirma nugriauk`); continue; }
      if (eff >= o.to) { log('Užsakymas įvykdytas:', BNAME[o.gid] || o.gid, 'vieta', o.slot, 'lygis', eff); continue; }
      keep.push(o);
      const lane = o.slot <= 18 ? 'field' : 'building';
      if (out[lane] || (cur && cur.uc) || !free[lane] || isSkipped('ord' + o.id)) continue;
      out[lane] = gidNow
        ? { lane, kind: 'upgrade', slot: o.slot, gid: o.gid, key: 'ord' + o.id, desc: `UŽSAKYMAS: ${BNAME[o.gid] || o.gid} → ${eff + 1} (iki ${o.to})` }
        : { lane, kind: 'new', slot: o.slot, gid: o.gid, cat: BCAT[o.gid] || 1, key: 'ord' + o.id, desc: `UŽSAKYMAS: naujas ${BNAME[o.gid] || o.gid} (vieta ${o.slot})` };
    }
    if (keep.length !== list.length) setOrders(DID, keep);
    return out;
  }
  function showOrders() {
    const old = document.getElementById('abOrd'); if (old) { old.remove(); return; }
    const vs = ownVillageList(); let cur = String(DID);
    const box = document.createElement('div'); box.id = 'abOrd';
    box.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:100000;background:#fffaf0;color:#222;border:2px solid #a63;border-radius:8px;padding:10px;max-height:80vh;overflow:auto;font:12px sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.4);min-width:480px';
    const render = () => {
      const bl = GM_getValue('bldList@' + cur, null) || [], fl = GM_getValue('fldList@' + cur, null) || [];
      const all = [...fl.map(f => ({ ...f, slot: +f.slot })), ...bl].filter(x => x.gid);
      const freeSlots = bl.filter(b => !b.gid && b.slot <= 38).map(b => b.slot);
      const lst = myOrders(cur);
      const nm = x => `${BNAME[x.gid] || 'gid ' + x.gid} ${x.lvl} lyg. (vieta ${x.slot})`;
      box.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><b>Statybų užsakymai</b><button id="abOrX" style="border:0;background:#a63;color:#fff;border-radius:4px;padding:2px 8px;cursor:pointer">✕</button></div>
        <div style="margin-bottom:6px">Kaimas: <select id="abOrV">${vs.map(v => `<option value="${v.did}"${v.did === cur ? ' selected' : ''}>${v.name}</option>`).join('')}</select></div>
        ${!bl.length ? '<div style="color:#a22">Šio kaimo pastatų sąrašas dar nežinomas – skriptas jį sužinos, kai apsilankys šiame kaime (~10 min.).</div>' : ''}
        <div style="font-weight:bold;margin:6px 0 3px">Laukia vykdymo (pirmiau už planą, eilės tvarka):</div>
        ${lst.length ? lst.map((o, i) => `<div style="border-top:1px solid #eee;padding:2px 0">${i + 1}. ${o.type === 'demo' ? 'Nugriauti' : o.type === 'new' ? 'Pastatyti' : 'Kelti'} ${BNAME[o.gid] || o.gid} (vieta ${o.slot})${o.type !== 'demo' ? ' iki ' + o.to + ' lyg.' : ''} <button data-del="${o.id}" style="border:0;background:#a22;color:#fff;border-radius:3px;cursor:pointer">✕</button></div>`).join('') : '<div style="color:#555">nėra</div>'}
        <div style="font-weight:bold;margin:10px 0 3px">Kelti esamą:</div>
        <select id="abOrUp">${all.map(x => `<option value="${x.slot}|${x.gid}">${nm(x)}</option>`).join('')}</select> iki <input id="abOrUpL" type="number" min="1" max="20" value="10" style="width:45px"> lyg. <button id="abOrUpB">Pridėti</button>
        <div style="font-weight:bold;margin:10px 0 3px">Pastatyti naują:</div>
        <select id="abOrNw">${Object.entries(BCAT).map(([g]) => `<option value="${g}">${BNAME[g]}</option>`).join('')}</select> vietoje <select id="abOrNs">${freeSlots.map(sl => `<option value="${sl}">${sl}</option>`).join('') || '<option value="">laisvų nėra</option>'}</select> iki <input id="abOrNwL" type="number" min="1" max="20" value="1" style="width:45px"> lyg. <button id="abOrNwB">Pridėti</button>
        <div style="font-weight:bold;margin:10px 0 3px">Nugriauti:</div>
        <select id="abOrDm">${bl.filter(b => b.gid && ![16, 15].includes(b.gid)).map(x => `<option value="${x.slot}|${x.gid}">${nm(x)}</option>`).join('')}</select> <button id="abOrDmB">Pridėti</button>
        <div style="color:#555;margin-top:8px">Griovimui reikia Gyvenamojo pastato 10 lygio; griaunama po lygį, kol nugriaunama visai. Pastatyti kitą toje vietoje: pirma „Nugriauti“, tada „Pastatyti naują“ (vieta atsiras sąraše, kai bus tuščia). Planas gali tą patį pastatą vėliau atstatyti, jei jis yra plane.</div>`;
      box.querySelector('#abOrX').onclick = () => box.remove();
      box.querySelector('#abOrV').onchange = e => { cur = e.target.value; render(); };
      const add = o => { if (o.to) o.to = Math.min(o.to, o.gid === 23 ? 10 : 20); const l = myOrders(cur); l.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), ...o }); setOrders(cur, l); log('Užsakymas pridėtas:', cur, JSON.stringify(o)); render(); };
      box.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { setOrders(cur, myOrders(cur).filter(o => o.id !== b.dataset.del)); render(); });
      const up = box.querySelector('#abOrUpB'); if (up) up.onclick = () => { const [sl, g] = box.querySelector('#abOrUp').value.split('|').map(Number); if (sl) add({ type: 'up', slot: sl, gid: g, to: Math.max(1, +box.querySelector('#abOrUpL').value || 1) }); };
      const nw = box.querySelector('#abOrNwB'); if (nw) nw.onclick = () => { const sl = +box.querySelector('#abOrNs').value; if (sl) add({ type: 'new', slot: sl, gid: +box.querySelector('#abOrNw').value, to: Math.max(1, +box.querySelector('#abOrNwL').value || 1) }); };
      const dm = box.querySelector('#abOrDmB'); if (dm) dm.onclick = () => { const [sl, g] = (box.querySelector('#abOrDm').value || '').split('|').map(Number); if (sl) add({ type: 'demo', slot: sl, gid: g }); };
    };
    render(); document.body.appendChild(box);
  }
  function showMarket() {
    const old = document.getElementById('abMkt'); if (old) { old.remove(); return; }
    const vs = ownVillageList(), c = jget('mktCfg', {}), cv = c.v || {};
    const opt = (sel, list) => list.map(([v, t]) => `<option value="${v}"${String(sel) === String(v) ? ' selected' : ''}>${t}</option>`).join('');
    const box = document.createElement('div'); box.id = 'abMkt';
    box.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:100000;background:#fffaf0;color:#222;border:2px solid #357;border-radius:8px;padding:10px;max-height:80vh;overflow:auto;font:12px sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.4);min-width:520px';
    const log8 = jget('sentLog', []).slice(-8).reverse().map(e => `${hhmm(e.ts)} ${((vs.find(v => v.did === e.from) || {}).name) || e.from} → ${((vs.find(v => v.did === e.to) || {}).name) || e.to}: ${e.amt.join(' / ')}`).join('<br>') || '–';
    box.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><b>Turgus – resursų siuntimas tarp kaimų</b><button id="abMktX" style="border:0;background:#357;color:#fff;border-radius:4px;padding:2px 8px;cursor:pointer">✕</button></div>
      <div style="margin-bottom:6px"><b>Prioritetinis kaimas</b> (į jį siunčia visi kaimai su režimu „Auto“):
        <select id="abMkP">${opt(c.prio || '', [['', '– nėra (automatika kaip anksčiau)'], ...vs.map(v => [v.did, v.name])])}</select>
        pildyti iki <input id="abMkF" type="number" min="10" max="100" value="${c.fill || 90}" style="width:50px"> % sandėlio</div>
      <table style="border-collapse:collapse;width:100%"><tr style="background:#dde6f0"><th style="text-align:left;padding:3px">Kaimas</th><th>Režimas</th><th>Į kurį (rankinis)</th><th>Palikti sau %<br><span style="font-weight:normal">gamybos/val.</span></th><th>Grūdų palikti %<br><span style="font-weight:normal">gamybos/val.</span></th><th>Siųsti grūdus</th></tr>
      ${vs.map(v => { const m = cv[v.did] || {}; return `<tr data-did="${v.did}" style="border-top:1px solid #dde"><td style="padding:3px;font-weight:bold">${v.name}</td>
        <td><select class="mkM">${opt(m.mode || 'auto', [['auto', 'Auto'], ['manual', 'Rankinis'], ['off', 'Nesiųsti']])}</select></td>
        <td><select class="mkT">${opt(m.to || '', [['', '–'], ...vs.filter(o => o.did !== v.did).map(o => [o.did, o.name])])}</select></td>
        <td><input class="mkK" type="number" min="0" max="100" value="${m.keep ?? 0}" style="width:50px"></td>
        <td><input class="mkC" type="number" min="0" max="100" value="${m.keepCrop ?? 10}" style="width:50px"></td>
        <td style="text-align:center"><input class="mkG" type="checkbox"${m.crop === false ? '' : ' checked'}></td></tr>`; }).join('')}
      </table>
      <div style="color:#555;margin:6px 0">Auto: jei yra prioritetinis kaimas – siunčia į jį; jei nėra – kaip anksčiau (grandinė ir laukų spurtas). Rankinis: visada į pasirinktą kaimą. Nesiųsti: šis kaimas niekam nesiunčia.
        „Palikti sau %“ – nuo kaimo VALANDINĖS GAMYBOS (ne nuo sandėlio): pvz. 40 % – kaimas pasilieka 40 % to, ką prigamina, 60 % siunčiama (kaupiama iki ${MKT_BUD_CAP_H} val.; rezervo kariams neliečia). Be to, jei sandėlis > ${Math.round(MKT_OVER_PCT * 100)} % ir kaime dabar nėra ką statyti – siunčiamas ir perteklius virš ${Math.round(MKT_OVER_PCT * 100)} %.
        Gavėjui pildoma iki nurodyto %, įskaičiuojant pakeliui esančius siuntinius. Į kaimą, į kurį artėja puolimas (≤ 60 min.), nesiunčiama.</div>
      <button id="abMkS" style="padding:3px 10px;background:#357;color:#fff;border:0;border-radius:4px;cursor:pointer">Išsaugoti</button>
      <div style="font-weight:bold;margin:12px 0 3px;border-top:1px solid #dde;padding-top:8px">Siųsti nurodytą kiekį</div>
      <div>Iš <select id="abSoF">${opt(String(DID), vs.map(v => [v.did, v.name]))}</select> į <select id="abSoT">${opt((vs.find(v => v.did !== String(DID)) || {}).did || '', vs.map(v => [v.did, v.name]))}</select>
        <select id="abSoE">${opt('0', [['0', 'vieną kartą'], ['1', 'kas 1 val.'], ['2', 'kas 2 val.'], ['4', 'kas 4 val.'], ['6', 'kas 6 val.'], ['12', 'kas 12 val.'], ['24', 'kas 24 val.']])}</select></div>
      <div style="margin:4px 0">Mediena <input id="abSo0" type="number" min="0" value="0" style="width:65px"> Molis <input id="abSo1" type="number" min="0" value="0" style="width:65px"> Geležis <input id="abSo2" type="number" min="0" value="0" style="width:65px"> Grūdai <input id="abSo3" type="number" min="0" value="0" style="width:65px">
        <button id="abSoA" style="padding:2px 8px;background:#357;color:#fff;border:0;border-radius:4px;cursor:pointer">Pridėti</button></div>
      <div id="abSoL" style="font-size:11px"></div>
      <div style="color:#555;margin-top:4px">Siunčiama pirmiau už automatiką (ir kai kaimui nustatyta „Nesiųsti“). Jei dabar tiek resursų nėra ar netelpa į prekeivius – siunčiama kiek galima, likutis – vėliau.</div>
      <div style="color:#555;margin-top:8px">Paskutiniai siuntimai:</div><div style="font-size:11px">${log8}</div>`;
    document.body.appendChild(box);
    document.getElementById('abMktX').onclick = () => box.remove();
    const vn = d => ((vs.find(v => v.did === String(d)) || {}).name) || d;
    const soRender = () => {
      const l = shipOrders();
      box.querySelector('#abSoL').innerHTML = l.length ? l.map(o => `<div style="border-top:1px solid #eee;padding:2px 0">${vn(o.from)} → ${vn(o.to)}: ${o.amt.join(' / ')} ${o.every ? 'kas ' + o.every + ' val.' : 'vieną kartą'} · liko ${o.left.join(' / ')}${o.next > Date.now() ? ' · kitas ' + hhmm(o.next) : ''} <button data-so="${o.id}" style="border:0;background:#a22;color:#fff;border-radius:3px;cursor:pointer">✕</button></div>`).join('') : '<span style="color:#555">užsakymų nėra</span>';
      box.querySelectorAll('[data-so]').forEach(b => b.onclick = () => { jset('shipOrders', shipOrders().filter(o => o.id !== b.dataset.so)); soRender(); });
    };
    soRender();
    document.getElementById('abSoA').onclick = () => {
      const from = box.querySelector('#abSoF').value, to = box.querySelector('#abSoT').value;
      const amt = [0, 1, 2, 3].map(k => Math.max(0, parseInt(box.querySelector('#abSo' + k).value, 10) || 0));
      if (!from || !to || from === to || !amt.some(v => v > 0)) { box.querySelector('#abSoL').insertAdjacentHTML('afterbegin', '<div style="color:#a22">pasirink skirtingus kaimus ir kiekį</div>'); return; }
      const l = shipOrders(); l.push({ id: Date.now().toString(36), from, to, amt, left: [...amt], every: +box.querySelector('#abSoE').value || 0, next: 0 }); jset('shipOrders', l);
      GM_setValue('shipNext@' + from, 0); log('Siuntimo užsakymas pridėtas:', vn(from), '→', vn(to), amt.join('/'));
      soRender();
    };
    document.getElementById('abMkS').onclick = () => {
      const nc = { prio: document.getElementById('abMkP').value, fill: +document.getElementById('abMkF').value || 90, v: {} };
      for (const tr of box.querySelectorAll('tr[data-did]')) {
        nc.v[tr.dataset.did] = { mode: tr.querySelector('.mkM').value, to: tr.querySelector('.mkT').value, keep: +tr.querySelector('.mkK').value || 0, keepCrop: +tr.querySelector('.mkC').value || 0, crop: tr.querySelector('.mkG').checked };
      }
      jset('mktCfg', nc);
      for (const v of vs) GM_setValue('supplyNext@' + v.did, 0);           // nauji nustatymai – veikia iškart
      log('Turgaus nustatymai išsaugoti:', JSON.stringify(nc));
      box.remove();
    };
  }
  function supplyChore() {
    noteStock();
    if (shipOrderChore()) return true;                                     // tavo nurodyti kiekiai – pirmiau už viską
    if (!SUPPLY || Date.now() < (vget('supplyNext', 0) || 0)) return false;
    const vs = allVillages(), i = vs.indexOf(String(DID));
    {                                                                      // TURGAUS nustatymai (lango „Turgus“) – pirmiau už automatiką
      const mc = jget('mktCfg', {}), my = (mc.v || {})[DID] || { mode: 'auto' };
      if (my.mode === 'off') return false;
      if (my.mode === 'manual' && my.to) return routeSend(my.to, my, mc);
      if (mc.prio && vs.includes(String(mc.prio))) {
        if (String(mc.prio) === String(DID)) return false;                 // prioritetinis kaimas pats nieko neatiduoda
        return routeSend(mc.prio, my, mc);
      }
    }
    // 1) LAUKŲ SPURTAS: kitas kaimas kelia paskutinius laukus iki 10 – remia VISI kaimai (pats spurtuojantis – ne)
    {
      const all = jget('supplyNeeds', {});
      if (!(all[DID] || {}).push && avgFieldsNC() >= PUSH_DONOR_AVG) {      // jauni kaimai (laukai < 8) patys auga – neremia
        const pt = Object.entries(all).filter(([d, n]) => d !== String(DID) && vs.includes(d) && n.push && Date.now() - n.ts < 90 * 60000 && !attackSoon(d, 60))
          .sort((a, b) => b[1].need.reduce((p, q) => p + q, 0) - a[1].need.reduce((p, q) => p + q, 0))[0];
        if (pt) {
          const st = stockInfo(), n = pt[1];
          const send = [0, 1, 2].map(k => Math.max(0, Math.min(n.need[k], Math.floor(st.have[k] - PUSH_KEEP * st.cw))));
          const crop = Math.max(0, Math.min(n.need[3] || 0, Math.floor(st.have[3] - PUSH_KEEP_CROP * st.cg)));
          if (send.reduce((a, b) => a + b, 0) + crop >= SUPPLY_MIN) {
            vset('supplyNext', Date.now() + rand(...SUPPLY_EVERY) * 60000);
            log(`Laukų spurtas: siunčiu į ${n.x}|${n.y} – ${send.join('/')} + grūdai ${crop}`);
            jset('supplyPlan', { did: pt[0], x: n.x, y: n.y, send, crop });
            startChore('supply', '/build.php?gid=17&t=5');
            return true;
          }
        }
      }
    }
    if (i < 0 || i + 1 >= vs.length) return false;                     // paskutinis (naujausias) kaimas nieko neremia
    const toDid = vs[i + 1];                                             // remiamas TIK kitas kaimas grandinėje
    const n = jget('supplyNeeds', {})[toDid];
    if (!n || Date.now() - n.ts > 90 * 60000 || attackSoon(String(toDid), 60)) return false;
    const myAvg = avgFieldsNC();
    const theirAvg = n.avg != null ? n.avg : ((jget('villAvgF', {})[toDid] || {}).avg || 0);
    if (theirAvg >= myAvg) {                                             // pasivijo (ar aplenkė) rėmėją – rėmimas sustoja
      if (Date.now() >= (vget('supplyStopLog', 0) || 0)) { vset('supplyStopLog', Date.now() + 3 * 3600000); log(`Rėmimas sustabdytas: kaimo ${toDid} laukai (${theirAvg.toFixed(1)}) ≥ šio (${myAvg.toFixed(1)})`); }
      return false;
    }
    const st = stockInfo();
    const send = [0, 1, 2].map(k => Math.max(0, Math.min(n.need[k], Math.floor(st.have[k] - SUPPLY_KEEP * st.cw))));
    if (send.reduce((a, b) => a + b, 0) < SUPPLY_MIN) return false;
    vset('supplyNext', Date.now() + rand(...SUPPLY_EVERY) * 60000);
    jset('supplyPlan', { did: toDid, x: n.x, y: n.y, send });
    startChore('supply', '/build.php?gid=17&t=5');
    return true;
  }
  async function onSupply() {
    GM_setValue('chore', '');
    await sleep(rand(2500, 4500));
    const p = jget('supplyPlan', null);
    const c = document.querySelector('#build') || document.body;
    const txt = clean(c.innerText);
    const fm = txt.match(/Prekeiviai:?\s*(\d+)\s*\/\s*(\d+)/i), capM = parseInt(((txt.match(/Prekeivio talpa:?\s*([\d.,\s]+)/i) || [])[1] || '0').replace(/\D/g, ''), 10) || 0;
    const room = (fm ? +fm[1] : 0) * capM;
    const ix = c.querySelector('input[name=x]'), iy = c.querySelector('input[name=y]');
    const ins = ['lumber', 'clay', 'iron', 'crop'].map(n => c.querySelector(`input[name=${n}]`));
    if (!p || !ix || !iy || ins.slice(0, 3).some(i => !i) || !room) { setStatus('resursų siuntimas: forma kitokia / nėra prekeivių'); return finishChore(); }
    let send = [...p.send.slice(0, 3), p.crop || 0], tot = send.reduce((a, b) => a + b, 0);
    if (tot > room) send = send.map(v => Math.floor(v * room / tot));            // tilpti į laisvus prekeivius
    setInput(ix, String(p.x)); await sleep(rand(300, 700)); setInput(iy, String(p.y)); await sleep(rand(800, 1500));
    for (let i = 0; i < 4; i++) { if (ins[i] && (i < 3 || send[3] > 0)) { setInput(ins[i], String(send[i])); await sleep(rand(200, 600)); } }
    await sleep(rand(1000, 1800));
    const btn = [...c.querySelectorAll('button')].find(b => /send/.test(b.className) && !b.disabled && !/disabled/.test(b.className));
    if (!btn) { setStatus('resursų siuntimas: mygtukas neaktyvus'); return finishChore(); }
    btn.click();
    await sleep(rand(1500, 2500));
    const conf = [...document.querySelectorAll('button')].find(b => b.offsetParent && /green/.test(b.className) && !/disabled/.test(b.className) && /siųsti|patvirtinti|send|confirm/i.test(b.textContent) && b !== btn);
    if (conf) { conf.click(); await sleep(rand(1500, 2500)); }
    if (!p.dump) { const needs = jget('supplyNeeds', {}); delete needs[p.did]; jset('supplyNeeds', needs); }
    { const sl = jget('sentLog', []).filter(e => Date.now() - e.ts < 24 * 3600000); sl.push({ from: String(DID), to: String(p.did || ''), amt: send.slice(0, 4), ts: Date.now() }); jset('sentLog', sl.slice(-60)); }
    if (p.ord) shipOrderSent(p.ord, send.slice(0, 4));
    if (p.bud) { const b = vget('mktBud', null); if (b && b.r) { b.r = b.r.map((v, k) => Math.max(0, v - (send[k] || 0))); vset('mktBud', b); } }   // išsiųsta gamybos dalis
    log(`${p.dump ? 'Gelbėjimas: ' : ''}Resursai išsiųsti į ${p.x}|${p.y}: mediena ${send[0]}, molis ${send[1]}, geležis ${send[2]}, grūdai ${send[3] || 0}`);
    setStatus(`išsiųsta į ${p.x}|${p.y}: ${send.join(' / ')}`);
    finishChore();
  }
  // Žemėlapio langelio ataskaitų istorija: mūsų žvalgas/kariai žuvo per 24 val.? → { ts } arba null
  async function recentDeath(x, y) {
    const j = await api('/api/v1/map/tile-details', { x, y });
    const box = document.createElement('div'); box.innerHTML = (j && j.html) || '';
    const hist = [...box.querySelectorAll('[class*=iReport]')].map(e => ({ ic: +((String(e.className).match(/iReport(\d+)/) || [])[1] || 0), ts: reportTs(clean((e.closest('tr,li,div') || e).textContent || '')) }));
    return hist.find(h => (h.ic === 17 || h.ic === 3) && h.ts && Date.now() - h.ts < 24 * 3600000) || null;
  }
  async function onRaidSend() {
    if (chorePending('raidDone')) { GM_setValue('chore', ''); await sleep(rand(1500, 3000)); return finishChore(); }
    if (chorePending('raidConfirm')) {
      GM_setValue('chore', '');
      await sleep(rand(2000, 4000));
      const vis = [...document.querySelectorAll('button')].filter(b => b.offsetParent && !b.disabled);
      const btn = vis.find(b => /^\s*(confirm|bestätigen|patvirtinti)\s*$/i.test(b.textContent));
      if (!btn) { setStatus('plėšimas: patvirtinimo nėra (gal taikinys apsaugotas)'); const t = jget('raidTarget', null); if (t) { const raids = jget('raids', {}); const k = t.x + '|' + t.y; raids[k] = { ...(raids[k] || {}), block: Date.now() + 24 * 3600000 }; jset('raids', raids); } return finishChore(); }
      GM_setValue('chore', 'raidDone'); GM_setValue('choreTs', Date.now()); GM_setValue('navTs', Date.now());
      btn.click();
      const t = jget('raidTarget', null);
      log('Plėšimas išsiųstas:', t);
      setStatus(`išsiųsta: ${t ? Object.entries(t.troops).map(([u, n]) => n + (u === 't4' ? ' žvalg.' : u === 't1' ? ' legion.' : u === 't3' ? ' imperion.' : u === 't11' ? ' herojus' : ' EI')).join(', ') + ' → ' + t.player + ' ' + t.x + '|' + t.y : ''}`);
      return;
    }
    GM_setValue('chore', '');
    await sleep(rand(2500, 5000));
    const t = jget('raidTarget', null);
    // Paskutinė apsauga prieš siunčiant į ŽAIDĖJO kaimą: žemėlapio langelio ataskaitų istorija. Jei ten mūsų žvalgas žuvo (≤ 24 val.) – nesiunčiam
    if (t && !t.reinf && !/išvedimas/.test(t.name || '') && !/oaz/i.test(t.player || '')) {
      try {
        const dead = await recentDeath(t.x, t.y);
        if (dead) {
          const raids = jget('raids', {}), k = t.x + '|' + t.y, st = raids[k] || { good: 0, bad: 0 };
          const fm = jget('farms', {})[k], pop = fm && fm.hist && fm.hist.length ? (fm.hist[fm.hist.length - 1] || [0, 0])[1] : 0;
          st.scoutDead = true; st.deadPop = pop; st.deadUntil = dead.ts + 24 * 3600000; st.block = st.deadUntil; raids[k] = st; jset('raids', raids);
          log(`Siuntimas atšauktas: ${k} („${t.name || ''}“) – ten mūsų kariai/žvalgas žuvo ${hhmm(dead.ts)}; taikinys išimtas iki ${hhmm(st.deadUntil)}`);
          setStatus(`atšaukta: ${k} – ten žuvo mūsų žvalgas`);
          return finishChore();
        }
      } catch (e) {}
    }
    // Paskutinė apsauga: į kaimą artėja puolimas – gynėjai (legionieriai, pretorionai) į reidus neišeina (pastiprinimas – gali)
    if (t && !t.reinf && t.troops && defHome()) {
      for (const u of DEF_UNITS) delete t.troops[u];
      if (!Object.keys(t.troops).length) { log('Siuntimas atšauktas: gynėjai lieka namie (puolimas artėja arba gynėjai reiduose išjungti)'); setStatus('puolimas artėja – gynėjai lieka'); return finishChore(); }
    }
    const ok = document.querySelector('form button[name=ok], form button[type=submit]');
    const raid = document.querySelector(`input[name=eventType][value="${t && t.reinf ? 5 : t && t.attack ? 3 : 4}"]`);   // 5 – pastiprinimas, 3 – puolimas (numušti gynybą), 4 – reidas
    if (!t || !ok || !raid) { setStatus('plėšimas: siuntimo forma kitokia'); return finishChore(); }
    let put = 0;
    for (const [u, n0] of Object.entries(t.troops)) {
      const inp = document.querySelector(`input[name="troop[${u}]"]`);
      const avail = inp && !inp.disabled ? parseInt(clean((inp.closest('td') || inp.parentElement).textContent).replace(/[^\d]/g, ''), 10) || 0 : 0;   // „/ N“ – kiek tikrai yra namie
      let n = n0 === 'max' ? avail : Math.min(+n0 || 0, avail);           // niekada daugiau nei yra (kitaip žaidimas atmeta visą siuntimą)
      if (!n) { if (n0 === 'max' || u === 't11' || /išvedimas/.test(t.name || '')) continue; setStatus('plėšimas: karių nėra namie'); return finishChore(); }
      if (t.attack && n0 !== 'max' && n < +n0) { log(`Puolimas atšauktas: reikia ${n0} ${u}, namie tik ${n} – mažesnis būrys pralaimėtų`); setStatus('puolimas atšauktas: per mažai karių namie'); return finishChore(); }
      setInput(inp, String(n)); put++; await sleep(rand(400, 900));
    }
    if (!put) { setStatus('siuntimas: karių namie nėra'); return finishChore(); }
    raid.click(); await sleep(rand(600, 1400));
    GM_setValue('chore', 'raidConfirm'); GM_setValue('choreTs', Date.now()); GM_setValue('navTs', Date.now());
    ok.click();
  }
  // ---- Aljanso „Užpuolimai“ (/alliance/reports): ką puola aljanso nariai. Iš ten – gynėjai ir grobis BE savo žvalgų,
  //      plius nauji fermų kandidatai (kaimai, iš kurių aljansiečiai neša grobį be nuostolių) ----
  // žemėlapio langelio numeris → koordinatės (žemėlapis 401×401, nuo −200 iki 200)
  const dToXY = d => ({ x: ((d - 1) % 401) - 200, y: 200 - Math.floor((d - 1) / 401) });
  async function allyReportsChore() {
    if (!ALLY_INTEL || !MILITARY_ROLES.includes(ROLE) || Date.now() < (GM_getValue('allyRepNext', 0) || 0)) return;
    GM_setValue('allyRepNext', Date.now() + rand(...ALLY_REP_EVERY) * 60000);
    try {
      const seen = jget('allyRepSeen', []), raids = jget('raids', {}), farms = jget('farms', {});
      const v = vget('xy', null);
      let details = 0, added = 0, intel = 0;
      // Sąraše (patikrinta): „Žaidėjas užpuolė reidu / atakavo / ištyrė Taikinys – laikas“. „Gamta“ – oazės, „Natars“ – natarai: praleidžiam
      for (let pg = 1; pg <= ALLY_REP_PAGES && details < 8; pg++) {
        const d = new DOMParser().parseFromString(await (await fetch('/alliance/reports?page=' + pg, { credentials: 'same-origin' })).text(), 'text/html');
        const rows = [...d.querySelectorAll('table tbody tr')];
        if (!rows.length) break;
        for (const r of rows) {
          if (details >= 8) break;
          const a = [...r.querySelectorAll('a')].map(x => x.getAttribute('href') || '').find(isRepHref);
          if (!a) continue;
          const txt = clean(r.textContent).replace(/\s+/g, ' ').trim();
          if (/Gamta|oaz|oasis/i.test(txt)) continue;                    // natarų ataskaitos – naudingos (jų kaimai – taikiniai)
          const key = a.slice(0, 60);
          if (seen.includes(key)) continue;
          seen.push(key);
          details++;
          const href = a.startsWith('?') ? '/report' + a : a;
          const h = await (await fetch(href, { credentials: 'same-origin' })).text();
          const dd2 = new DOMParser().parseFromString(h, 'text/html');
          const defBox = dd2.querySelector('.role.defender') || dd2;
          const tl = [...defBox.querySelectorAll('a[href*="karte.php?d="]')].map(x => +((x.getAttribute('href').match(/d=(\d+)/) || [])[1] || 0)).find(Boolean);
          if (!tl) continue;
          const { x: tx, y: ty } = dToXY(tl), k = tx + '|' + ty;
          if (v && Math.hypot(tx - v.x, ty - v.y) > RAID_MAX_DIST + 5) continue;          // per toli – nesvarbu
          const [dd, pr] = [await reportDefenders(href), await reportProfit(href)];
          const st = raids[k] || { good: 0, bad: 0 };
          st.ally = { def: dd ? dd.def : null, defInf: dd ? dd.defInf : null, units: dd ? dd.units : null, loot: pr ? pr.loot : null, lost: pr ? pr.lost : null, ts: Date.now() };
          if (dd) { st.def = dd.def; st.defInf = dd.defInf; st.defUnits = dd.units; st.defTs = Date.now(); st.scouted = st.scouted || Date.now(); st.scoutRes = st.scoutRes ?? 1; st.clear = dd.units > 0; intel++; }
          raids[k] = st;
          // aljansiečiai iš ten neša grobį be (didelių) nuostolių → fermos kandidatas
          const f = Object.values(farms).find(x => x.x === tx && x.y === ty);
          if (f && pr && pr.loot > 0 && (!pr.lost || pr.loot >= RAID_PROFIT_RATIO * pr.lost) && !isMyAlly(f)) { f.allyFarm = Date.now(); added++; }
          log(`Aljanso ataskaita: ${k} – gynėjų ${dd ? dd.units : '?'}, grobis ${pr ? pr.loot : '?'}${f ? '' : ' (kaimas dar ne mūsų sąraše)'}`);
          await sleep(rand(400, 1000));
        }
      }
      jset('raids', raids); jset('farms', farms); jset('allyRepSeen', seen.slice(-600));
      if (details) log(`Aljanso ataskaitos: perskaityta ${details}, gynyba sužinota ${intel}, fermų pažymėta ${added}`);
    } catch (e) { log('Aljanso ataskaitų klaida:', e && e.message); }
  }
  // ---- PELNO SUVESTINĖ: iš ataskaitų – kiek per 24 val. pagrobta ir kiek prarasta (kariai resursais), atskirai kaimams/oazėms/natarams ir gynybai ----
  async function statsChore() {
    if (Date.now() < (GM_getValue('statNext', 0) || 0)) return;
    GM_setValue('statNext', Date.now() + rand(15, 25) * 60000);
    const own = ownVillageList().map(v => v.name).filter(Boolean);
    const st = jget('stats', []), seen = new Set(st.map(e => e.id));
    const nv = e => parseInt(clean(e.textContent).replace(/\D/g, ''), 10) || 0;
    let opened = 0;
    try {
      for (let pg = 1; pg <= 4 && opened < 25; pg++) {
        const d = new DOMParser().parseFromString(await (await fetch('/report?page=' + pg, { credentials: 'same-origin' })).text(), 'text/html');
        const rows = [...d.querySelectorAll('table tbody tr')];
        if (!rows.length) break;
        let old = false;
        for (const r of rows) {
          const txt = clean(r.textContent).replace(/\s+/g, ' ').trim();
          const a = [...r.querySelectorAll('a')].map(x => x.getAttribute('href') || '').find(isRepHref); if (!a) continue;
          const id = (a.match(/id=([^&]+)/) || [])[1]; if (!id || seen.has(id)) continue;
          const ts = reportTs(txt); if (!ts) { old = true; continue; }                          // senesnė nei vakar – nebedomina
          const mOff = own.find(n => txt.startsWith(n + ' užpuolė') || txt.startsWith(n + ' atakavo'));
          const mDef = !mOff && own.find(n => new RegExp('(užpuolė reidu|užpuolė|atakavo) ' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' (šiandien|vakar)').test(txt));
          if (!mOff && !mDef) { seen.add(id); continue; }
          if (opened >= 25) break;
          opened++;
          const rd = await repDoc(a);
          const g = rd && [...rd.querySelectorAll('th')].find(e => /^(Grobis|Bounty)$/i.test(e.textContent.trim()));
          const loot = g ? [...g.closest('tr').querySelectorAll('.resourceWrapper .value')].slice(0, 4).reduce((s2, e) => s2 + nv(e), 0) : 0;
          const l = rd && [...rd.querySelectorAll('th')].find(e => /^(Prarasti resursai|Resources lost)$/i.test(e.textContent.trim()));
          const lv = l ? [...l.closest('tr').querySelectorAll('td')].map(td => nv(td)) : [0, 0];
          const kind = mDef ? 'gynyba' : /oaz|oasis/i.test(txt) ? 'oazės' : /Natars/i.test(txt) ? 'natarai' : 'kaimai';
          st.push({ id, ts, v: mOff || mDef, k: kind, loot: mDef ? -loot : loot, lost: mDef ? (lv[1] || 0) : (lv[0] || 0) });
          seen.add(id);
          await sleep(rand(250, 600));
        }
        if (old) break;
        await sleep(rand(300, 800));
      }
    } catch (e) { log('Pelno suvestinės klaida:', e && e.message); }
    jset('stats', st.filter(e => Date.now() - e.ts < 48 * 3600000).slice(-1500));
  }
  function showStats() {
    const old = document.getElementById('abStats'); if (old) { old.remove(); return; }
    const now = Date.now(), st = jget('stats', []).filter(e => now - e.ts < 24 * 3600000);
    const groups = {};
    for (const e of st) { const k = e.v + '|' + e.k; const g = groups[k] = groups[k] || { v: e.v, k: e.k, n: 0, loot: 0, lost: 0 }; g.n++; g.loot += e.loot; g.lost += e.lost; }
    const rows = Object.values(groups).sort((a, b) => (a.v > b.v ? 1 : a.v < b.v ? -1 : 0) || (a.k > b.k ? 1 : -1));
    const tot = rows.reduce((t, g) => ({ n: t.n + g.n, loot: t.loot + g.loot, lost: t.lost + g.lost }), { n: 0, loot: 0, lost: 0 });
    const f = n => Math.round(n).toLocaleString('lt-LT');
    const box = document.createElement('div'); box.id = 'abStats';
    box.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:100000;background:#fffaf0;color:#222;border:2px solid #357;border-radius:8px;padding:10px;max-height:80vh;overflow:auto;font:12px sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.4);min-width:460px';
    box.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><b>Pelnas per 24 val.</b><button id="abStX" style="border:0;background:#357;color:#fff;border-radius:4px;padding:2px 8px;cursor:pointer">✕</button></div>
      <table style="border-collapse:collapse;width:100%"><tr style="background:#dde6f0"><th style="text-align:left;padding:3px">Kaimas</th><th>Kur</th><th>Kartų</th><th>Grobis</th><th>Prarasta</th><th>Pelnas</th></tr>
      ${rows.map(g => `<tr style="border-top:1px solid #dde"><td style="padding:3px">${g.v}</td><td>${g.k}</td><td style="text-align:right">${g.n}</td><td style="text-align:right">${f(g.loot)}</td><td style="text-align:right">${f(g.lost)}</td><td style="text-align:right;font-weight:bold;color:${g.loot - g.lost >= 0 ? '#270' : '#a22'}">${f(g.loot - g.lost)}</td></tr>`).join('')}
      <tr style="border-top:2px solid #357;font-weight:bold"><td style="padding:3px">Iš viso</td><td></td><td style="text-align:right">${tot.n}</td><td style="text-align:right">${f(tot.loot)}</td><td style="text-align:right">${f(tot.lost)}</td><td style="text-align:right;color:${tot.loot - tot.lost >= 0 ? '#270' : '#a22'}">${f(tot.loot - tot.lost)}</td></tr></table>
      <div style="color:#555;margin-top:6px">„Prarasta“ – žuvusių karių kaina resursais. „gynyba“ – kai puolė tave: grobis su minusu (išnešta), prarasta – tavo žuvę kariai. Herojaus premija už gyvūnus oazėse neįskaičiuota. Atnaujinama kas ~20 min.</div>`;
    document.body.appendChild(box);
    document.getElementById('abStX').onclick = () => box.remove();
  }
  async function reportsChore() {
    if (Date.now() < (GM_getValue('repNext', 0) || 0)) return false;
    GM_setValue('repNext', Date.now() + rand(10, 20) * 60000);
    try {
      const rows = [];
      for (const pg of [1, 2, 3]) {                                       // ~30 naujausių ataskaitų (žvalgų daug – vieno puslapio neužtenka)
        const d = new DOMParser().parseFromString(await (await fetch('/report?page=' + pg, { credentials: 'same-origin' })).text(), 'text/html');
        rows.push(...d.querySelectorAll('table tbody tr'));
        await sleep(rand(300, 800));
      }
      await readRaidReports(rows);
    } catch (e) { log('Ataskaitų klaida:', e && e.message); }
    return false;
  }

  // ---- Gynyba: išvesti EI ir žvalgus prieš atvykstant puolimui ----
  // Slėptuvės talpa vienai žaliavai (lygis 10 = 2000, patikrinta žaidime; formulė ~200·1,2915^(l−1))
  function otherVillage() {                                            // artimiausias kitas savo kaimas (iš šoninio sąrašo)
    const me = villageXY(); if (!me) return null;
    const vs = [...document.querySelectorAll('#sidebarBoxVillageList .listEntry.village')].map(e => {
      const m = clean((e.querySelector('.coordinatesGrid, .coordinates') || {}).textContent || '').replace(/\u2212/g, '-').match(/(-?\d+)\s*\|\s*(-?\d+)/);
      return m ? { did: e.getAttribute('data-did'), x: +m[1], y: +m[2] } : null;
    }).filter(v => v && v.did !== DID);
    return vs.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0] || null;
  }
  function crannyCap() { const l = (vget('blv', {}) || {})[23] || 0; return l ? Math.round(200 * Math.pow(1.2915, l - 1)) : 0; }
  // Artėja puolimas: likus DUMP_AT_MIN min. – visi resursai virš slėptuvės → kariai (kaimo pagrindinis vienetas), likutis – NPC → kariai
  function dumpCheck() {
    if (!DUMP || !MILITARY_ROLES.includes(ROLE)) return false;
    const eta = attackInMin();
    if (!isFinite(eta)) return false;
    if (eta > DUMP_AT_MIN && eta < 90) { later(Math.max(15, (eta - DUMP_AT_MIN) * 60 + rand(5, 30)), () => (location.href = '/dorf1.php')); return false; }
    if (eta > DUMP_AT_MIN || eta < 1.5) return false;
    const at = GM_getValue('attackAt', 0) || 0;
    if (Math.abs((GM_getValue('dumpFor', 0) || 0) - at) < 3 * 60000) return false;        // šiam puolimui jau padaryta
    GM_setValue('dumpFor', at);
    const st = stockInfo(), hide = crannyCap();
    const over = st.have.reduce((a, h) => a + Math.max(0, h - hide), 0);
    if (over < DUMP_MIN_OVER) { log('Puolimas artėja, bet virš slėptuvės tik', over); return false; }
    const done = resDone(), lv = vget('blv', {}) || {};
    const ei = done.imperatoris && (lv[20] || 0) >= 1;
    jset('trainPlan', ei ? { unit: 't5', label: 'Imperatoriaus raitelių', dump: true, stage: 1 } : { unit: 't1', label: 'legionierių', dump: true, stage: 1 });
    log(`PUOLIMAS po ${eta.toFixed(1)} min.: gelbėju ~${over} resursų – treniruoju ${ei ? 'EI' : 'legionierius'}`);
    startChoreFast('train', ei ? '/build.php?gid=20' : '/build.php?gid=19');
    return true;
  }
  const DEF_UNITS = ['t1', 't2'];   // romėnų gynėjai: legionieriai, pretorionai – puolimo metu niekada neišvedami; kiti kaimai juos siunčia į puolamą
  const DEF_SPEED = { t1: 6, t2: 5 };
  // Visi savi kariai namie (u1–u10 + herojus) iš dorf1 „Karinės pajėgos“; narvų gyvūnai (u31–u40) – ne
  function homeAll() {
    const out = {};
    for (const tr of document.querySelectorAll('#troops tr')) {
      const img = tr.querySelector('img.unit'); if (!img) continue;
      const m = String(img.className).match(/\bu(\d{1,2}|hero)\b/); if (!m) continue;
      const n = parseInt(clean((tr.querySelector('.num') || {}).textContent || '').replace(/\D/g, ''), 10) || 0;
      if (!n) continue;
      if (m[1] === 'hero') { /* herojus – NIEKADA neišvedamas (gina kaimą; slėpimą valdo žaidimo nustatymas) */ } else if (+m[1] >= 1 && +m[1] <= 10 && +m[1] !== 10 && +m[1] !== 9) out['t' + m[1]] = n;   // senatoriai/kolonistai – nepuola
    }
    return out;
  }
  async function dodgeCheck() {
    if (!DODGE) return false;
    const eta = attackInMin() * 60;
    if (!isFinite(eta)) return false;
    if (eta > DODGE_SEC + 60 && eta < 25 * 60) {                        // grįžti į dorf1 laiku
      later(Math.max(10, eta - DODGE_SEC - 20), () => (location.href = '/dorf1.php'));
      return false;
    }
    if (eta > DODGE_SEC + 60 || eta < 15) return false;
    const troops = homeAll();
    for (const u of DEF_UNITS) delete troops[u];                      // gynėjai (legionieriai, pretorionai) LIEKA ginti
    delete troops.t4;                                                  // žvalgai LIEKA – priešo žvalgybą (rodoma kaip puolimas) jie sunaikina
    if (!Object.keys(troops).length) return false;
    const at = GM_getValue('attackAt', 0) || (Date.now() + eta * 1000);
    if (Math.abs((GM_getValue('dodgeAt@' + DID, 0) || 0) - at) < 2 * 60000) return false;   // šiam puolimui jau išvesta
    const empty = jget('emptyOases', []);
    const v = vget('xy', null) || villageXY();
    // grupė juda lėčiausio vieneto greičiu; kelias pirmyn-atgal turi būti ilgesnis už likusį laiką + 90 s, kitaip grįš prieš puolimą
    const SPD = { t3: 7, t4: 16, t5: 14, t6: 10, t7: 4, t8: 3 };
    const slow = Math.min(...Object.keys(troops).map(u => SPD[u] || 6)) * TROOP_SPEED;     // laukeliai/val.
    const minD = (eta + 90) * slow / 2 / 3600;
    // Oazė TIKRINAMA dabar (sąrašas sensta – gyvūnai atsiranda!): tik laisva ir be NĖ VIENO gyvūno
    let tgt = null;
    const cands = v ? empty.map(o => ({ ...o, d: Math.hypot(o.x - v.x, o.y - v.y) })).filter(o => o.d >= minD).sort((a, b) => a.d - b.d).slice(0, 6) : [];
    for (const o of cands) {
      try {
        const info = await tileAnimals(o.x, o.y);
        if (info.free && info.total === 0 && !info.animals.length) { tgt = o; break; }
        jset('emptyOases', jget('emptyOases', []).filter(e => !(e.x === o.x && e.y === o.y)));   // nebe tuščia – iš sąrašo lauk
        log(`Išvedimas: oazė ${o.x}|${o.y} NE tuščia (${info.total} gyv.) – netinka`);
      } catch (e) {}
    }
    const at0 = at;
    if (!tgt) {
      // Saugiausia: PASTIPRINIMAS į kitą savo kaimą (jokios kovos). Kariai liks ten – atsiimsi Susibūrimo vietoje
      const own = ownVillageList().filter(o => o.did !== String(DID) && o.x !== null && !(((jget('incoming', {}) || {})[o.did] || 0) > Date.now() - 5 * 60000));
      const me = v || villageXY();
      const ov = me && own.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
      if (!ov) { log('Išvedimas: nėra nei tuščios oazės, nei saugaus savo kaimo'); setStatus('PUOLIMAS: nėra kur saugiai išvesti karių!'); return false; }
      GM_setValue('dodgeAt@' + DID, at0); GM_setValue('dodgeTs', Date.now());
      jset('raidTarget', { x: ov.x, y: ov.y, troops, name: 'išvedimas (pastiprinimas)', player: ov.name, reinf: true });
      log('PUOLIMAS: tuščios oazės nėra – puolimo karius siunčiu pastiprinimu į savo kaimą', ov.name, troops);
      startChoreFast('raidSend', `/build.php?id=39&gid=16&tt=2&x=${ov.x}&y=${ov.y}`);
      return true;
    }
    if (!tgt) { log('Išvedimas: nežinau tuščios oazės'); setStatus('PUOLIMAS: nežinau tuščios oazės kariams išvesti!'); return false; }
    GM_setValue('dodgeAt@' + DID, at0); GM_setValue('dodgeTs', Date.now());
    jset('raidTarget', { x: tgt.x, y: tgt.y, troops, name: 'išvedimas', player: 'tuščia oazė (patikrinta)' });
    log('PUOLIMAS po', Math.round(eta), 's – išvedu puolimo karius (gynėjai ir herojus lieka) į PATIKRINTĄ tuščią oazę', tgt, troops);
    startChoreFast('raidSend', `/build.php?id=39&gid=16&tt=2&x=${tgt.x}&y=${tgt.y}`);
    return true;
  }
  // ---- Artėjantys puolimai į VISUS kaimus (be kaimo perjungimo): šoninio sąrašo „incomingTroops“ patarimo API ----
  // Grąžina { did: atvykimo laikas (ms) } – tik puolimai/reidai (ne pastiprinimai)
  async function incomingScan(force) {
    if (!force && Date.now() < (GM_getValue('incNext', 0) || 0)) return jget('incoming', {});
    GM_setValue('incNext', Date.now() + rand(100, 170) * 1000);
    const out = {}, exact = {}, now = Date.now(), prevAll = jget('incoming', {});
    for (const did of allVillages()) {
      try {
        const j = await api('/api/v1/tooltip/incomingTroops', { villageIds: [+did] });
        const html = String((j && j.text) || '') + ' ' + String((j && j.title) || '');
        if (!html.trim()) continue;
        const box = document.createElement('div'); box.innerHTML = html;
        const all = clean(box.textContent).replace(/\s+/g, ' ');
        const isAtt = t => /puolim|reid|ataka|attack|raid|\batt[13]\b|\ba1\b/i.test(t) && !/pastipr|reinforc|support/i.test(t);
        const secOf = e => { const v = +(e.getAttribute && e.getAttribute('value')); if (v > 0) return v; const m = clean(e.textContent || '').match(/(\d+):(\d\d):(\d\d)/); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : Infinity; };
        let best = Infinity;
        for (const tm of box.querySelectorAll('.timer, [counting], span, td, div')) {
          const s = secOf(tm); if (!isFinite(s)) continue;
          let p = tm, ctx = ''; for (let k = 0; k < 4 && p; k++) { ctx = (p.outerHTML || '') + ' ' + (p.textContent || ''); if (/puolim|reid|pastipr|attack|raid|reinforc|att\d|def\d|\ba\d\b|\bd\d\b/i.test(ctx)) break; p = p.parentElement; }
          if (isAtt(clean(ctx))) best = Math.min(best, s);
        }
        if (isFinite(best)) { out[did] = now + best * 1000; exact[did] = true; }
        else if (/puolim|reid|attack|raid/i.test(all) && !/^\s*\d*\s*(pastipr|reinforc)/i.test(all)) {
          // patarime laiko NĖRA (tik „Įeinantys reidai: 1“): paliekam anksčiau žinotą tikslų laiką, kitaip – „netrukus“ (tikslų pasiimsim nuėję į tą kaimą)
          const pe = jget('incomingExact', {});
          if (prevAll[did] && pe[did] && prevAll[did] > now) { out[did] = prevAll[did]; exact[did] = true; }
          else out[did] = prevAll[did] && prevAll[did] > now ? prevAll[did] : now + 10 * 60000;
        }
        await sleep(rand(200, 500));
      } catch (e) {}
    }
    const prev = jget('incoming', {});
    for (const d in out) if (!prev[d]) log(`ARTĖJA PUOLIMAS į kaimą ${d}${exact[d] ? `: po ${Math.round((out[d] - now) / 60000)} min.` : ' (laikas dar nežinomas)'}`);
    jset('incoming', out); jset('incomingExact', exact);
    return out;
  }
  // Jei kitame kaime (ne šiame) artimiausias puolimas po ≤ 25 min. ir ten dar neišvesta – pereinam į tą kaimą (išvedimas/gelbėjimas veikia aktyviame kaime)
  // Savų kaimų gyventojų skaičius (žemėlapio langelio duomenys), atnaujinama kas ~valandą: { did: pop }
  async function villPops() {
    const c = jget('villPop', null);
    if (c && Date.now() - c.ts < 60 * 60000) return c.p;
    const p = {};
    for (const v of ownVillageList()) {
      if (v.x === null) continue;
      try {
        const j = await api('/api/v1/map/tile-details', { x: v.x, y: v.y });
        const b = document.createElement('div'); b.innerHTML = (j && j.html) || '';
        const th = [...b.querySelectorAll('th')].find(e => /Gyventojų|Population/i.test(e.textContent));
        p[v.did] = th && th.nextElementSibling ? parseInt(clean(th.nextElementSibling.textContent).replace(/\D/g, ''), 10) || 0 : 0;
      } catch (e) {}
    }
    jset('villPop', { ts: Date.now(), p });
    return p;
  }
  // Šio kaimo kariai kitur (pastiprinimas) – iš Susibūrimo vietos „Apžvalga“ (tt=1): lentelės su nuoroda „atsiimti“
  const UNIT_SPEED_R = { t1: 6, t2: 5, t3: 7, t4: 16, t5: 14, t6: 10, t7: 4, t8: 3, t9: 4, t10: 5, t11: 7 };
  async function recallCheck(attackAt) {
    let d;
    try { d = new DOMParser().parseFromString(await (await fetch('/build.php?gid=16&tt=1', { credentials: 'same-origin' })).text(), 'text/html'); } catch (e) { return false; }
    const me = villageXY(), vs = ownVillageList(), now = Date.now(), done = jget('recallDone', {});
    for (const t of d.querySelectorAll('table.troop_details')) {
      const a = [...t.querySelectorAll('a')].find(x => /atsiimti|withdraw/i.test(x.textContent));
      if (!a) continue;
      const txt = clean(t.textContent).replace(/\s+/g, ' ');
      const where = vs.find(v => v.did !== String(DID) && v.name && new RegExp('(Pastiprinimas|Reinforcement)[^:]*:\\s*' + v.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(txt));
      const cnt = [...t.querySelectorAll('tbody.units tr td.unit, td.unit')].map(td => parseInt(clean(td.textContent).replace(/\D/g, ''), 10) || 0);
      const units = cnt.map((n, i) => n > 0 ? 't' + (i + 1) : null).filter(Boolean);
      if (!units.length) continue;
      const key = String(DID) + ':' + Math.round(attackAt / 60000) + ':' + (where ? where.did : txt.slice(0, 30));
      if (done[key]) continue;
      done[key] = now; jset('recallDone', Object.fromEntries(Object.entries(done).slice(-30)));
      if (!where || !me || where.x === null) { log('Atsiėmimas: nežinau, kur stovi kariai –', txt.slice(0, 80)); continue; }
      const dist = Math.hypot(where.x - me.x, where.y - me.y), slow = Math.min(...units.map(u => UNIT_SPEED_R[u] || 5)) * TROOP_SPEED;
      const back = dist / slow * 3600000;
      if (now + back + 60000 > attackAt) { log(`Atsiėmimas: kariai iš „${where.name}“ nespės grįžti (${Math.round(back / 60000)} min., puolimas po ${Math.round((attackAt - now) / 60000)} min.)`); continue; }
      if ((((jget('incoming', {}) || {})[where.did]) || 0) > now - 5 * 60000) {
        const pops = await villPops();
        if ((pops[where.did] || 0) >= (pops[DID] || 0)) { log(`Atsiėmimas: „${where.name}“ irgi puolamas ir didesnis – kariai lieka ten`); continue; }
      }
      log(`PUOLIMAS po ${Math.round((attackAt - now) / 60000)} min.: atsiimu savo karius iš „${where.name}“ (${units.join(', ')}, grįš per ${Math.round(back / 60000)} min.)`);
      setStatus(`atsiimu karius iš „${where.name}“`);
      GM_setValue('chore', 'recall'); GM_setValue('choreTs', Date.now()); GM_setValue('navTs', Date.now());
      location.href = a.getAttribute('href');
      return true;
    }
    return false;
  }
  // „Atsiimti“ puslapis: visi kariai (laukeliai užpildomi „/ N“ skaičiumi, jei tušti), tada patvirtinimas
  async function onRecall() {
    if (chorePending('recallConfirm')) {
      GM_setValue('chore', ''); await sleep(rand(1500, 3000));
      const btn = [...document.querySelectorAll('button')].find(b => b.offsetParent && !b.disabled && /^\s*(confirm|patvirtinti|atsiimti|withdraw)\s*$/i.test(b.textContent));
      if (btn) { btn.click(); log('Atsiėmimas patvirtintas'); await sleep(rand(1500, 2500)); }
      else log('Atsiėmimas: patvirtinimo mygtuko nėra (gal jau išsiųsta)');
      return finishChore();
    }
    GM_setValue('chore', ''); await sleep(rand(2000, 3500));
    let put = 0;
    for (const inp of document.querySelectorAll('input[name^="troop["], input[name^="t"]')) {
      if (inp.type === 'hidden' || inp.disabled) continue;
      const cur = parseInt(inp.value, 10) || 0;
      const mx = parseInt(clean((inp.closest('td') || inp.parentElement).textContent).replace(/[^\d]/g, ''), 10) || +inp.getAttribute('max') || 0;
      if (!cur && mx) { setInput(inp, String(mx)); await sleep(rand(200, 500)); }
      if (cur || mx) put++;
    }
    const ok = [...document.querySelectorAll('form button[type=submit], form button[name=ok], button')].find(b => b.offsetParent && !b.disabled && /green|ok|submit/i.test(b.className + ' ' + b.name + ' ' + b.type) && /atsiimti|siųsti|withdraw|send|ok/i.test(b.textContent + ' ' + (b.value || '')));
    if (!put || !ok) { log('Atsiėmimas: forma neatpažinta (kariai', put, ', mygtukas', !!ok, ') – atsiimk ranka!'); setStatus('ATSIIMK KARIUS RANKA – forma neatpažinta'); return finishChore(); }
    GM_setValue('chore', 'recallConfirm'); GM_setValue('choreTs', Date.now()); GM_setValue('navTs', Date.now());
    ok.click();
    await sleep(4000);
    if (chorePending('recallConfirm')) return onRecall();                   // patvirtinimas tame pačiame puslapyje (be perkrovimo)
  }
  // Puolimas praėjo – į kitą kaimą pastiprinimui išsiųsti gynėjai (ir herojus) atsiimami namo, jei ten naujo puolimo neartėja (≤ 60 min.)
  async function returnHelpCheck() {
    const now = Date.now(), hs = jget('helpSent', []);
    const due = hs.filter(e => e.b === String(DID) && !e.back && now > e.aT + 3 * 60000 && now - e.aT < 24 * 3600000);
    if (!due.length) return false;
    const inc = jget('incoming', {}) || {}, vs = ownVillageList();
    let d = null;
    for (const e of due) {
      if ((inc[e.a] || 0) > now - 5 * 60000 && inc[e.a] - now < 60 * 60000) continue;          // ten artėja kitas puolimas – kariai lieka
      const A = vs.find(v => v.did === e.a); if (!A) { e.back = now; continue; }
      if (!d) { try { d = new DOMParser().parseFromString(await (await fetch('/build.php?gid=16&tt=1', { credentials: 'same-origin' })).text(), 'text/html'); } catch (er) { return false; } }
      const rx = new RegExp('(Pastiprinimas|Reinforcement)[^:]*:\\s*' + A.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
      const t = [...d.querySelectorAll('table.troop_details')].find(tb => rx.test(clean(tb.textContent).replace(/\s+/g, ' ')) && [...tb.querySelectorAll('a')].some(x => /atsiimti|withdraw/i.test(x.textContent)));
      e.back = now; jset('helpSent', hs);
      if (!t) { log(`Pastiprinimas „${A.name}“: mūsų karių ten nebėra (žuvo ar jau grįžo)`); continue; }
      const a = [...t.querySelectorAll('a')].find(x => /atsiimti|withdraw/i.test(x.textContent));
      log(`Puolimas į „${A.name}“ praėjo – atsiimu savo gynėjus namo`);
      setStatus(`atsiimu pastiprinimą iš „${A.name}“`);
      GM_setValue('chore', 'recall'); GM_setValue('choreTs', Date.now()); GM_setValue('navTs', Date.now());
      location.href = a.getAttribute('href');
      return true;
    }
    jset('helpSent', hs);
    return false;
  }
  async function attackGoto() {
    if (!DODGE && !DUMP) return false;
    const inc = await incomingScan();
    const now = Date.now();
    if (document.querySelector('#movements')) {                          // šiame kaime tikslų laiką matom dorf1 „Atvykstantys kariai“
      const am = attackInMin(), ex = jget('incomingExact', {});
      if (isFinite(am)) { inc[DID] = now + am * 60000; ex[DID] = true; } else if (ex[DID]) { delete inc[DID]; delete ex[DID]; }
      jset('incoming', inc); jset('incomingExact', ex);
    }
    const exactT = jget('incomingExact', {}), vs = ownVillageList();
    const all = Object.entries(inc).filter(([d, t]) => t - now > 20000).sort((a, b) => a[1] - b[1]);
    if (!all.length) return false;
    // 1) Kito kaimo puolimo laikas nežinomas (patarime jo nėra) – nueinam į tą kaimą vieną kartą pasižiūrėti
    const unk = all.find(([d]) => d !== String(DID) && !exactT[d]);
    if (unk) { log(`Puolimas į kaimą ${unk[0]} – laikas nežinomas, einu pasižiūrėti`); GM_setValue('navTs', Date.now()); location.href = '/dorf1.php?newdid=' + unk[0]; return true; }
    // 1b) ŠIS kaimas puolamas, o jo kariai stovi pastiprinimu kitame savo kaime – atsiimti, jei spės grįžti iki puolimo
    if (exactT[DID] && inc[DID] && inc[DID] - now > 60000) { const rc = await recallCheck(inc[DID]); if (rc) return true; }
    // 2) Gynėjų (ir herojaus) pastiprinimas iš KITŲ savų kaimų – VISADA. Jei puolami keli kaimai – ginamas DIDŽIAUSIAS (gyventojų skaičius),
    //    kiti (ir puolami mažesni) siunčia savo gynėjus į jį; tik tie, kurie spės atvykti
    const attacked = all.filter(([d, t]) => exactT[d] && t - now < 3 * 3600000);
    const pops = attacked.length > 1 ? await villPops() : {};
    const prioList = attacked.slice().sort((a, b) => ((pops[b[0]] || 0) - (pops[a[0]] || 0)) || (a[1] - b[1])).slice(0, 1);
    for (const [aDid, aT] of prioList) {
      const A = vs.find(v => v.did === aDid); if (!A || A.x === null) continue;
      const hk = aDid + ':' + Math.round(aT / 60000), help = jget('defHelp', {});
      for (const B of vs) {
        if (B.did === aDid || B.x === null || (help[hk] || []).includes(B.did)) continue;
        const cnt = ((jget('troopCnts', {})[B.did] || {}).c) || {};
        const d = Math.hypot(B.x - A.x, B.y - A.y), left = (aT - now) / 1000 - 60;
        let units = DEF_UNITS.filter(u => (cnt[u] || 0) > 0 && d / (DEF_SPEED[u] * TROOP_SPEED) * 3600 < left);
        const bAtt = (inc[B.did] || 0) > now - 5 * 60000;
        if (bAtt && (pops[B.did] || 0) >= (pops[aDid] || 0)) units = [];   // pats puolamas ir ne mažesnis – savų neatiduoda (mažesni atiduoda didžiausiam)
        if (hc().defHelp && !(bAtt && (pops[B.did] || 0) >= (pops[aDid] || 0)) && GM_getValue('heroHomeDid', '') === B.did && d / (7 * TROOP_SPEED) * 3600 < left) units.push('t11');
        help[hk] = [...(help[hk] || []), B.did]; jset('defHelp', Object.fromEntries(Object.entries(help).slice(-20)));
        if (!units.length) { if (DEF_UNITS.some(u => (cnt[u] || 0) > 0) && !bAtt) log(`Gynėjai iš „${B.name}“ nespės į „${A.name}“ (${d.toFixed(1)} lauk., liko ${Math.round(left / 60)} min.)`); continue; }
        jset('raidTarget', { x: A.x, y: A.y, troops: Object.fromEntries(units.map(u => [u, 'max'])), name: 'gynėjų pastiprinimas', player: A.name, reinf: true });
        log(`PUOLIMAS į „${A.name}“ po ${Math.round((aT - now) / 60000)} min.: siunčiu ${units.join(', ')} iš „${B.name}“`);
        { const hs = jget('helpSent', []).filter(e => now - e.aT < 24 * 3600000); hs.push({ a: aDid, aT, b: B.did }); jset('helpSent', hs); }
        setStatus(`gynėjai iš „${B.name}“ → „${A.name}“`);
        GM_setValue('chore', 'raidSend'); GM_setValue('choreTs', Date.now()); GM_setValue('navTs', Date.now());
        location.href = `/build.php?id=39&gid=16&tt=2&x=${A.x}&y=${A.y}&newdid=${B.did}`;
        return true;
      }
    }
    // 3) Artimiausias puolimas ≤ 25 min. kitame kaime (ten dar neišvesta) – pereinam ten (išvedimas, resursų gelbėjimas)
    const soon = all.find(([d, t]) => t - now < 25 * 60000 && Math.abs((GM_getValue('dodgeAt@' + d, 0) || 0) - t) > 2 * 60000);
    if (!soon || soon[0] === String(DID)) return false;
    log(`Į kaimą ${soon[0]} po ${Math.round((soon[1] - now) / 60000)} min. atvyks puolimas – einu ten`);
    setStatus(`PUOLIMAS į ${soon[0]} – pereinu`);
    GM_setValue('navTs', Date.now());
    location.href = '/dorf1.php?newdid=' + soon[0];
    return true;
  }
  // Nakties pauzės metu – tik sargyba: kas ~2–3 min. tikrinam artėjančius puolimus; radus – keliamės (dorf1 to kaimo)
  function pauseWatch() {
    if (window.__abWatch) return; window.__abWatch = true;
    const tick = async () => {
      try {
        const inc = await incomingScan(true), now = Date.now();
        const hit = Object.entries(inc).filter(([d, t]) => t - now < 25 * 60000 && t - now > 20000 && Math.abs((GM_getValue('dodgeAt@' + d, 0) || 0) - t) > 2 * 60000).sort((a, b) => a[1] - b[1])[0];
        if (hit && enabled()) { log('Pauzės sargyba: artėja puolimas į', hit[0], '– keliuosi'); GM_setValue('navTs', Date.now()); location.href = hit[0] === DID ? '/dorf1.php' : '/dorf1.php?newdid=' + hit[0]; return; }
      } catch (e) {}
      setTimeout(tick, rand(120, 180) * 1000);
    };
    setTimeout(tick, rand(20, 60) * 1000);
  }

  function stockInfo() {
    const have = [1, 2, 3, 4].map(i => num(document.getElementById('l' + i)));
    const capE = document.querySelectorAll('.capacity');
    const cw = num(capE[0]), cg = num(capE[1]);
    const r = have.map((h, i) => h / ((i < 3 ? cw : cg) || 1));
    return { have, cw, cg, r };
  }
  function npcToday() { const d = jget('npcDay', null); return d && d.day === new Date().toDateString() ? d.n : 0; }
  function balanceChore() {
    const st = stockInfo();
    if (!st.cw || !st.cg) return false;
    const [rw, rc, ri, rk] = st.r;
    if (NPC_TRADE && ri >= NPC_FULL && rk >= NPC_FULL && rw < 0.5 && rc < 0.5 && npcToday() < NPC_MAX_PER_DAY && Date.now() >= (GM_getValue('npcNext', 0) || 0)) {
      GM_setValue('npcNext', Date.now() + rand(40, 70) * 60000);
      startChore('npc', '/build.php?gid=17&t=0');
      return true;
    }
    // Trūksta grūdų: įdėti 1000 tos žaliavos, kurios daugiausia (mediena/molis/geležis), už 1000 grūdų (naujoko apsaugoje leidžiama tik 1:1)
    // Pirma bandoma NUPIRKTI (priimti kitų pasiūlymą „grūdai už mano žaliavą“ 1:1) – greičiau, nes grūdų rinkoje perteklius;
    // jei tinkamo nėra – įdedamas savas pasiūlymas
    const inc = jget('cropIncoming', { amt: 0, until: 0 }), incAmt = inc.until > Date.now() ? inc.amt : 0;
    if (MARKET_TRADE && !underAttack() && rk + incAmt / st.cg < CROP_BUY_BELOW && Date.now() >= (GM_getValue('cropBuyNext', 0) || 0)
        && Math.max(st.have[0], st.have[1], st.have[2]) >= CROP_BUY_MIN_GIVE + 200) {
      GM_setValue('cropBuyNext', Date.now() + rand(...CROP_BUY_EVERY) * 60000);
      startChore('cropBuy', '/build.php?gid=17&t=1');
      return true;
    }
    if (MARKET_TRADE && Date.now() >= (GM_getValue('marketNext', 0) || 0)) {
      const hi = [0, 1, 2].filter(i => st.r[i] >= MARKET_HIGH)   // grūdų turgui NIEKADA nesiūlom (prekeivių švaistymas; grūdų pertekliaus sąmoningai nekuriam).sort((a, b) => st.r[b] - st.r[a])[0];
      const lo = [0, 1, 2].filter(i => st.r[i] < MARKET_LOW).sort((a, b) => st.r[a] - st.r[b])[0];   // grūdai – atskira taisyklė (CROP_BUY_BELOW)
      if (hi !== undefined && lo !== undefined && hi !== lo) {
        GM_setValue('marketNext', Date.now() + rand(...MARKET_EVERY) * 60000);
        jset('offerPlan', { give: hi, want: lo });
        startChore('offer', '/build.php?gid=17&t=2');
        return true;
      }
    }
    return false;
  }
  const setInput = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); ['input', 'keyup', 'change'].forEach(e => el.dispatchEvent(new Event(e, { bubbles: true }))); };
  const resName = ['mediena', 'molis', 'geležis', 'grūdai'];
  async function onNpc() {
    GM_setValue('chore', '');
    await sleep(rand(2500, 5000));
    const open = [...document.querySelectorAll('button')].find(b => b.offsetParent && /^\s*(exchange resources|keistis resursais)\s*$/i.test(b.textContent));
    if (!open) { setStatus('NPC: mygtuko nerasta'); return finishChore(); }
    open.click();
    await sleep(rand(2000, 3500));
    const dlg = [...document.querySelectorAll('div')].filter(e => e.offsetParent && e.querySelector('input[name=desired0]')).pop();
    if (!dlg) { setStatus('NPC: langas nerastas'); return finishChore(); }
    const st = stockInfo();
    const total = st.have.reduce((a, b) => a + b, 0);
    const ratio = jget('npcRatio', null); GM_setValue('npcRatio', 'null');
    if (ratio && ratio.cost) {
      // GELBĖJIMAS: viską paskirstyti pagal kario kainos santykį, kad būtų galima pastatyti kuo daugiau karių
      const sumC = ratio.cost.reduce((a, b) => a + b, 0);
      const want = ratio.cost.map(c => Math.floor(total * c / sumC));
      want[3] += total - want.reduce((a, b) => a + b, 0);
      if (want.some((v, i) => v > (i < 3 ? st.cw : st.cg))) { setStatus('NPC (gelbėjimas): netelpa – nekeičiu'); return finishChore(); }
      for (let i = 0; i < 4; i++) { setInput(dlg.querySelector(`input[name=desired${i}]`), String(want[i])); await sleep(rand(200, 500)); }
      await sleep(rand(700, 1200));
      const txt = clean(dlg.textContent).replace(/\s+/g, ' ');
      const redeem = [...dlg.querySelectorAll('button')].find(b => /redeem|perskirstyti resursus/i.test(b.textContent) && b.offsetParent && !b.disabled && !/disabled/.test(b.className));
      if (!/(Rest|Liko):?\s*0\b/i.test(txt) || !redeem) { setStatus('NPC (gelbėjimas): patikra nepraėjo'); return finishChore(); }
      redeem.click();
      log('Gelbėjimas: NPC pagal kario kainą', want.join('/'));
      await sleep(rand(2000, 3000));
      jset('trainPlan', { ...ratio.plan, dump: true, stage: 2 });
      return startChoreFast('train', ratio.url);                        // iškart vėl treniruoti
    }
    const manual = !!GM_getValue('npcManual', false); GM_setValue('npcManual', false);
    const keepK = manual ? Math.min(total, Math.round(0.05 * st.cg)) : Math.round(Math.min(st.have[3], NPC_KEEP * st.cg));   // ranka: grūduose paliekama ~5 %, kad nebūtų 0
    let keepI = manual ? 0 : Math.round(Math.min(st.have[2], NPC_KEEP * st.cw));
    let rest = total - keepK - keepI;
    const room = manual ? Math.floor(st.cw * 0.95) : st.cw;          // ranka: mediena ir molis po 95 %, likutis (~5 %) – geležis/grūdai
    let w = Math.min(room, Math.floor(rest / 2)), c = Math.min(room, rest - w);
    if (rest - w - c > 0) w = Math.min(room, rest - c);
    let left = total - keepK - w - c;                               // kas netilpo į medieną ir molį – į geležį, paskui į grūdus
    keepI = Math.min(left, st.cw); left -= keepI;
    const crop = keepK + left;
    if (crop > st.cg) { setStatus('NPC: netelpa – nekeičiu'); return finishChore(); }
    const want = [w, c, keepI, crop];
    for (let i = 0; i < 4; i++) { setInput(dlg.querySelector(`input[name=desired${i}]`), String(want[i])); await sleep(rand(300, 700)); }
    await sleep(rand(800, 1500));
    const txt = clean(dlg.textContent).replace(/\s+/g, ' ');
    const restOk = /(Rest|Liko):?\s*0\b/i.test(txt);
    const redeem = [...dlg.querySelectorAll('button')].find(b => /redeem|perskirstyti resursus/i.test(b.textContent) && b.offsetParent && !b.disabled && !/disabled/.test(b.className));
    let cost = redeem ? parseInt(clean(redeem.textContent).replace(/\D/g, ''), 10) || 0 : 0;
    if (redeem && !cost) cost = NPC_MAX_GOLD;          // lietuviškame lange kaina ant mygtuko nerodoma (įprastai 3 auksai) – laikome maksimumu
    if (!restOk || !redeem || !cost || cost > NPC_MAX_GOLD) { setStatus(`NPC: neatitiko patikra (likutis/kaina ${cost}) – nekeičiu`); return finishChore(); }
    redeem.click();
    if (!manual) jset('npcDay', { day: new Date().toDateString(), n: npcToday() + 1 });
    log(`NPC mainai (${cost} aukso): ` + want.map((v, i) => resName[i] + ' ' + v).join(', '));
    setStatus(`NPC: mediena ${w}, molis ${c}, geležis ${keepI}, grūdai ${crop} (${cost} aukso)`);
    await sleep(rand(2500, 4000));
    finishChore();
  }
  // ---- TURGAUS PASIŪLYMAI MANO NAUDAI: kas ~valandą kiekvienas kaimas peržiūri visus pasiūlymus („Pirkti“) ir priima tuos,
  //      kur gauna ≥ TRADE_MIN_RATIO karto daugiau nei atiduoda (bet kuris resursas į bet kurį, ir grūdai). Kelionės laikas – nesvarbu ----
  const TRADE_ON = true, TRADE_MIN_RATIO = 1.3, TRADE_EVERY = [55, 70], TRADE_KEEP = 500, TRADE_KEEP_CROP = 0.10, TRADE_MAX_ACCEPT = 8, TRADE_MAX_PAGES = 30;
  function tradeChore() {
    if (!TRADE_ON || Date.now() < (vget('tradeNext', 0) || 0)) return false;
    if (underAttack()) return false;                                       // puolamas kaimas resursų nesikaupia (išneštų)
    if (!((vget('blv', {}) || {})[17])) return false;                     // turgavietės nėra
    vset('tradeNext', Date.now() + rand(...TRADE_EVERY) * 60000);
    startChore('trade', '/build.php?gid=17&t=1');
    return true;
  }
  // Pasiūlymų eilutės iš lentelės (React): ką gaunu (offered), ką atiduodu (wanted), prekeivių kiekis, mygtukas
  function tradeRows() {
    const resIdx = { lumber: 0, wood: 0, clay: 1, iron: 2, crop: 3 };
    const icon = td => { const i = td && td.querySelector('i[class*="_small"]'); const m = i && String(i.className).match(/(lumber|wood|clay|iron|crop)_small/); return m ? resIdx[m[1]] : -1; };
    const n = td => parseInt(clean((td || {}).textContent || '').replace(/\D/g, ''), 10) || 0;
    return [...document.querySelectorAll('table.offers tr')].filter(r => r.querySelector('td.accept button')).map(r => {
      const get = icon(r.querySelector('td.offered')), gAmt = n(r.querySelector('td.offered')), give = icon(r.querySelector('td.wanted')), wAmt = n(r.querySelector('td.wanted'));
      const btn = r.querySelector('td.accept button');
      return { r, get, gAmt, give, wAmt, k: wAmt ? gAmt / wAmt : 0, merch: n(r.querySelector('td.merchants')), btn, key: [get, gAmt, give, wAmt, clean((r.querySelector('td.duration') || {}).textContent).trim()].join(':'),
        enabled: !btn.disabled && !/disabled/.test(btn.className) };
    });
  }
  // Ar šį pasiūlymą galima ir verta priimti dabar (resursų likutis, vieta sandėlyje, prekeiviai)
  function tradeOk(c, have, st, freeM) {
    if (c.get < 0 || c.give < 0 || c.get === c.give || !c.wAmt || !c.enabled) return false;
    if (c.get === 3) return false;                                                               // grūdų čia NEimam – grūdus tvarko atskiras pirkimas (iki ~50 % klėties)
    if (c.gAmt < c.wAmt * TRADE_MIN_RATIO) return false;                                         // ne mano naudai
    const keep = c.give === 3 ? Math.max(TRADE_KEEP, Math.round(TRADE_KEEP_CROP * st.cg)) : TRADE_KEEP;
    if (have[c.give] - c.wAmt < keep) return false;                                              // atiduoti per daug
    const cap = c.get === 3 ? st.cg : st.cw;
    if (have[c.get] + c.gAmt > cap * 0.95) return false;                                         // netilptų – būtų prarasta
    return c.merch <= freeM;
  }
  async function onTrade() {
    GM_setValue('chore', '');
    await sleep(rand(2500, 4000));
    const st = stockInfo(); if (!st.cw) { setStatus('turgus: sandėlio duomenų nėra'); return finishChore(); }
    const merch = () => { const m = clean(document.body.innerText).match(/(?:Merchants|Prekeiviai):?\s*(\d+)\s*\/\s*(\d+)/i); return m ? +m[1] : 0; };
    let freeM = merch();
    if (!freeM) { setStatus('turgus: laisvų prekeivių nėra'); return finishChore(); }
    // filtras „Santykis“ – rodo tik pasiūlymus, kurie ne blogesni nei 1:1 (mažiau puslapių)
    const sg = [...document.querySelectorAll('div.filterGroup')].find(g => /Santykis|Ratio/i.test((g.previousElementSibling || {}).textContent || ''));
    const sb = sg && sg.querySelector('button');
    if (sb && !/\bactive\b/.test(sb.className)) { sb.click(); await sleep(rand(2000, 3000)); }
    // visi puslapiai: „pirmyn“ prideda po 10 eilučių
    for (let p = 0; p < TRADE_MAX_PAGES; p++) {
      const fw = document.querySelector('.pagination button.forward');
      if (!fw || /disabled/.test(fw.className)) break;
      const before = document.querySelectorAll('table.offers td.accept').length;
      fw.click(); await sleep(rand(1200, 2000));
      if (document.querySelectorAll('table.offers td.accept').length <= before) { await sleep(1500); if (document.querySelectorAll('table.offers td.accept').length <= before) break; }
    }
    const have = st.have.slice();
    const rowsAll = tradeRows();
    const good = rowsAll.filter(c => c.gAmt >= c.wAmt * TRADE_MIN_RATIO && c.get !== c.give && c.get !== 3).length;
    let done = 0, gained = 0, gave = 0;
    const tried = new Set();
    for (let k = 0; k < TRADE_MAX_ACCEPT && freeM > 0; k++) {
      const c = tradeRows().filter(x => !tried.has(x.key) && tradeOk(x, have, st, freeM)).sort((a, b) => (b.k - a.k) || (b.gAmt - a.gAmt))[0];
      if (!c) break;
      tried.add(c.key);
      c.btn.click(); await sleep(rand(1500, 2500));
      const dlgBtn = [...document.querySelectorAll('.dialogContents button, [class*=dialog] button')]
        .find(b => b.offsetParent && /green/.test(b.className) && !/disabled/.test(b.className) && !/atšaukti|cancel/i.test(b.textContent));
      if (dlgBtn) { dlgBtn.click(); await sleep(rand(1500, 2500)); }
      const fm2 = merch();
      if (fm2 >= freeM) { log(`Turgus: priimti nepavyko (${c.gAmt} ${resName[c.get]} už ${c.wAmt} ${resName[c.give]})`); continue; }
      freeM = fm2; done++; gained += c.gAmt; gave += c.wAmt;
      have[c.give] -= c.wAmt; have[c.get] += c.gAmt;
      log(`Turgus: PRIIMTA – gaunu ${c.gAmt} ${resName[c.get]} už ${c.wAmt} ${resName[c.give]} (1:${c.k.toFixed(2)})`);
      await sleep(rand(1200, 2500));
    }
    setStatus(done ? `turgus: priimta ${done} pasiūl. – gauta ${gained}, atiduota ${gave}` : `turgus: pasiūlymų ${rowsAll.length}, mano naudai (≥1:${TRADE_MIN_RATIO}) ${good}, tinkamų priimti nėra`);
    if (!done) log(`Turgus: peržiūrėta ${rowsAll.length}, mano naudai ${good}, priimti netinka (resursai/vieta/prekeiviai)`);
    finishChore();
  }
  async function onCropBuy() {
    GM_setValue('chore', '');
    await sleep(rand(2500, 4500));
    const st = stockInfo();
    const pageTxt = clean(document.body.innerText);
    const mm = pageTxt.match(/(?:Merchants|Prekeiviai):?\s*(\d+)\s*\/\s*(\d+)/i);
    const freeM = mm ? +mm[1] : 0;
    const resIdx = { lumber: 0, wood: 0, clay: 1, iron: 2, crop: 3 };
    const icon = td => { const i = td && td.querySelector('i[class*="_small"]'); const m = i && String(i.className).match(/(lumber|wood|clay|iron|crop)_small/); return m ? resIdx[m[1]] : -1; };
    const n = td => parseInt(clean((td || {}).textContent || '').replace(/\D/g, ''), 10) || 0;
    const mins = t => { const m = clean(t || '').match(/(\d+):(\d+):(\d+)/); return m ? (+m[1]) * 60 + (+m[2]) + (+m[3]) / 60 : 999; };
    const room = st.cg - st.have[3];
    // 1:1 – tik kai apsauga tikrai dar galioja: iki nuskaitytos pabaigos (protEnd) IR apsaugos užrašas matytas per paskutines 15 min.; kitu atveju – tik 1:2
    const isProt = Date.now() < (GM_getValue('protEnd', 0) || 0) && (/naujoko apsaug|beginner.?s protection/i.test(pageTxt) || Date.now() - (GM_getValue('protSeen', 0) || 0) < 15 * 60000);
    const ratio = isProt ? 1 : CROP_RATIO_FREE;
    const inc0 = jget('cropIncoming', { amt: 0, until: 0 });
    let incAmt = inc0.until > Date.now() ? inc0.amt : 0, incUntil = inc0.until || 0;
    let target = Math.round(CROP_BUY_TO * st.cg) - st.have[3] - incAmt;   // kiek dar trūksta iki ~50 %
    // filtras „Ieškau: grūdai“ – kad sąraše būtų tik grūdų pasiūlymai (kitaip jie gali būti kituose puslapiuose)
    const fg = [...document.querySelectorAll('div.filterGroup')].find(g => g.offsetParent && /Ieškau|Search/i.test((g.previousElementSibling || {}).textContent || ''));
    const cropF = fg && fg.querySelectorAll('button')[3];
    if (cropF && !/\bactive\b/.test(cropF.className)) { cropF.click(); await sleep(rand(2000, 3000)); }
    const have = st.have.slice();
    let freeNow = freeM, bought = 0, rowsN = 0;
    const pick = () => {
    const rows = [...document.querySelectorAll('table.offers tr')].filter(r => r.querySelector('td.accept button'));
    rowsN = rows.length;
    return rows.map(r => ({
      r, get: icon(r.querySelector('td.offered')), gAmt: n(r.querySelector('td.offered')),
      give: icon(r.querySelector('td.wanted')), wAmt: n(r.querySelector('td.wanted')),
      merch: n(r.querySelector('td.merchants')), dur: mins((r.querySelector('td.duration') || {}).textContent),
      btn: r.querySelector('td.accept button'),
    })).filter(c => c.get === 3 && c.give >= 0 && c.give <= 2 && c.gAmt >= c.wAmt * ratio      // gaunam grūdų ≥ santykis × atiduodama
      && c.wAmt <= have[c.give] - 200 && c.gAmt <= room - bought && c.gAmt <= target + 500
      && c.merch <= freeNow && c.dur <= CROP_BUY_MAX_MIN
      && !/disabled/.test(c.btn.className) && !c.btn.disabled)
      .sort((a, b) => (b.gAmt - a.gAmt) || (a.dur - b.dur));
    };
    // perkama iki ~50 % klėties: iki 3 pasiūlymų vienu kartu
    for (let k = 0; k < 3 && target > 0; k++) {
      const c = pick()[0];
      if (!c) break;
      c.btn.click();
      await sleep(rand(1500, 2500));
      // jei atsidaro patvirtinimo langas – spausti jo žalią mygtuką (ne „Atšaukti“)
      const dlgBtn = [...document.querySelectorAll('.dialogContents button, [class*=dialog] button')]
        .find(b => b.offsetParent && /green/.test(b.className) && !/disabled/.test(b.className) && !/atšaukti|cancel/i.test(b.textContent));
      if (dlgBtn) { dlgBtn.click(); await sleep(rand(1500, 2500)); }
      const mm2 = clean(document.body.innerText).match(/(?:Merchants|Prekeiviai):?\s*(\d+)\s*\/\s*(\d+)/i);
      const ok = mm2 ? +mm2[1] < freeNow : null;
      log(`Turgus: priimu ${c.gAmt} grūdų už ${c.wAmt} ${resName[c.give]} (${Math.round(c.dur)} min.) – ${ok === false ? 'NEPAVYKO?' : 'priimta'}`);
      if (ok === false) { setStatus('turgus: pasiūlymo priimti nepavyko (prekeiviai nepasikeitė)'); break; }
      freeNow = mm2 ? +mm2[1] : freeNow - c.merch;
      have[c.give] -= c.wAmt; bought += c.gAmt; target -= c.gAmt;
      incUntil = Math.max(incUntil, Date.now() + (c.dur + 5) * 60000);
      jset('cropIncoming', { amt: incAmt + bought, until: incUntil });
      await sleep(rand(1500, 3000));
    }
    if (bought) { setStatus(`turgus: nupirkta ${bought} grūdų (santykis ${ratio === 1 ? '1:1' : '1:' + ratio})`); return finishChore(); }
    {
      log(`Turgus: tinkamo grūdų pasiūlymo nėra (eilučių ${rowsN}, laisvų prekeivių ${freeM}, santykis 1:${ratio}) – dedu savo`);
      const give = [0, 1, 2].sort((a, b) => st.have[b] - st.have[a])[0];
      if (st.have[give] >= CROP_BUY_AMT + 300) { jset('offerPlan', { give, want: 3, amount: CROP_BUY_AMT, ratio }); startChore('offer', '/build.php?gid=17&t=2'); return; }
      setStatus('turgus: grūdų pirkti nėra ko (ir savo pasiūlymui per mažai)');
      return finishChore();
    }
    finishChore();
  }
  async function onOffer() {
    GM_setValue('chore', '');
    await sleep(rand(2500, 5000));
    const plan = jget('offerPlan', null);
    const pageTxt = clean(document.body.innerText);
    const mm = pageTxt.match(/(?:Merchants|Prekeiviai):?\s*(\d+)\s*\/\s*(\d+)/i);
    const freeM = mm ? +mm[1] : 0;
    const capM = parseInt(((pageTxt.match(/(?:Capacity per merchant|Prekeivio talpa):?\s*([\d,.\s]+)/i) || [])[1] || '0').replace(/\D/g, ''), 10) || 0;
    const create = [...document.querySelectorAll('button')].find(b => b.offsetParent && /^\s*(create offer|sukurti pasiūlymą)\s*$/i.test(b.textContent));
    if (!plan || !create || !freeM || !capM) { setStatus('turgus: laisvų pirklių nėra / forma kitokia'); return finishChore(); }
    const st = stockInfo();
    let amount = plan.amount ? Math.min(plan.amount, freeM * capM, st.have[plan.give])
                             : Math.min(Math.min(MARKET_MERCHANTS, freeM) * capM, Math.floor(st.have[plan.give] * 0.5));
    amount = Math.floor(amount / 100) * 100;
    if (amount < 300) { setStatus('turgus: per mažai siūlyti'); return finishChore(); }
    create.click();
    await sleep(rand(1500, 2500));
    const dlg = [...document.querySelectorAll('div')].filter(e => e.offsetParent && /I'm offering|Siūlau/i.test(e.textContent) && /I'm searching|Ieškau/i.test(e.textContent)).pop();
    if (!dlg) { setStatus('turgus: pasiūlymo langas nerastas'); return finishChore(); }
    const sel = [...dlg.querySelectorAll('button.selectResource')];
    const ins = [...dlg.querySelectorAll('input[type=text]')];
    if (sel.length < 8 || ins.length < 2) { setStatus('turgus: pasiūlymo forma kitokia'); return finishChore(); }
    sel[plan.give].click(); await sleep(rand(500, 1000));
    setInput(ins[0], String(amount)); await sleep(rand(500, 1000));
    sel[4 + plan.want].click(); await sleep(rand(500, 1000));
    const wantAmt = plan.want === 3 ? Math.floor(amount * (plan.ratio || MARKET_CROP_RATIO) / 100) * 100 : amount;   // grūdų pirkimas: apsaugoje 1:1, vėliau 1:2
    setInput(ins[1], String(wantAmt)); await sleep(rand(700, 1300));
    const ok = [...dlg.querySelectorAll('button')].find(b => /^\s*(create offer|sukurti pasiūlymą)\s*$/i.test(b.textContent) && !b.disabled && !/disabled/.test(b.className));
    if (!ok || +ins[0].value !== amount || +ins[1].value !== wantAmt) { setStatus('turgus: pasiūlymo neužpildžiau – nekuriu'); return finishChore(); }
    ok.click();
    log(`Turgus: siūlau ${amount} ${resName[plan.give]} už ${wantAmt} ${resName[plan.want]}`);
    setStatus(`turgus: ${amount} ${resName[plan.give]} → ${wantAmt} ${resName[plan.want]}`);
    await sleep(rand(2000, 3500));
    finishChore();
  }

  function farmChore() {
    if (!FARM_WATCH || Date.now() < (GM_getValue('farmNext', 0) || 0)) return false;
    const v = villageXY();
    if (!v) return false;
    GM_setValue('farmNext', Date.now() + rand(...FARM_EVERY) * 60000);
    startChore('farmScan', `/karte.php?x=${v.x}&y=${v.y}`);
    return true;
  }
  async function onFarmScan() {
    GM_setValue('chore', '');
    await sleep(rand(3000, 7000));
    const v = villageXY() || vget('xy', null);
    if (!v) return finishChore();
    const farms = jget('farms', {});
    const now = Date.now();
    const strip = t => String(t || '').replace(/&#x[0-9a-f]+;/gi, '').replace(/<[^>]+>/g, ' ').replace(/[\u200e\u200f\u202a-\u202e]/g, '');
    const tribeName = { v1: 'romėnai', v2: 'germanai', v3: 'galai', v5: 'natarai', v6: 'egiptiečiai', v7: 'hunai', v8: 'spartiečiai', v9: 'vikingai' };
    const centers = [];
    for (let i = -FARM_RADIUS; i <= FARM_RADIUS; i++) for (let j = -FARM_RADIUS; j <= FARM_RADIUS; j++) centers.push([v.x + i * 11, v.y + j * 9]);
    let seen = 0, myUid = GM_getValue('myUid', 0);
    try {
      for (const [cx, cy] of shuffle(centers)) {
        const pos = await api('/api/v1/map/position', { data: { x: cx, y: cy, zoomLevel: 1, ignorePositions: [] } });
        for (const t of (pos.tiles || [])) {
          if (!/\{k\.dt\}/.test(t.title || '') || !t.did) continue;
          if (t.position.x === v.x && t.position.y === v.y) {
            myUid = t.uid; GM_setValue('myUid', myUid);
            const myAlly = ((strip(t.text).match(/\{k\.allianz\}\s*(.*?)\s*\{k\.volk\}/) || [])[1] || '').trim();
            GM_setValue('myAlly', myAlly); GM_setValue('myAid', t.aid || 0);
            continue;
          }
          const tx = strip(t.text);
          const pop = parseInt((tx.match(/\{k\.einwohner\}\s*(\d+)/) || [])[1], 10);
          if (isNaN(pop)) continue;
          const f = farms[t.did] || { hist: [] };
          f.name = strip(t.title).replace(/\{k\.dt\}/, '').trim();
          f.player = ((tx.match(/\{k\.spieler\}\s*(.*?)\s*\{k\.einwohner\}/) || [])[1] || '').trim();
          f.ally = ((tx.match(/\{k\.allianz\}\s*(.*?)\s*\{k\.volk\}/) || [])[1] || '').trim();
          f.tribe = tribeName[(tx.match(/\{a\.(v\d+)\}/) || [])[1]] || '';
          f.uid = t.uid; f.aid = t.aid || 0; f.x = t.position.x; f.y = t.position.y;
          const last = f.hist[f.hist.length - 1];
          if (!last || now - last[0] > 30 * 60000) f.hist.push([now, pop]);
          if (f.hist.length > 30) f.hist = f.hist.slice(-30);
          f.seen = now;
          farms[t.did] = f; seen++;
        }
        await sleep(rand(2000, 5000));
      }
    } catch (e) { log('Fermų stebėjimo klaida:', e && e.message); }
    for (const k of Object.keys(farms)) if (now - (farms[k].seen || 0) > 7 * 86400000 || farms[k].uid === myUid) delete farms[k];   // dingę / savi
    jset('farms', farms);
    log(`Fermų stebėjimas: kaimų ${seen}`);
    setStatus(`stebimi kaimai: ${Object.keys(farms).length}`);
    finishChore();
  }
  // Fermos būsena: lyginamas dabartinis gyventojų skaičius su seniausiu per FARM_INACTIVE_H langą
  function farmStatus(f) {
    const h = f.hist || [];
    if (h.length < 2) return { st: 'naujas', d24: null, span: 0 };
    const now = Date.now(), cur = h[h.length - 1][1];
    const span = (h[h.length - 1][0] - h[0][0]) / 3600000;
    const old = h.find(x => now - x[0] <= 24 * 3600000) || h[0];
    const d24 = cur - old[1];
    // kiek valandų gyventojai neaugo (nuo paskutinio augimo)
    let flatSince = h[h.length - 1][0];
    for (let i = h.length - 1; i > 0; i--) { if (h[i][1] > h[i - 1][1]) break; flatSince = h[i - 1][0]; }
    const flatH = (h[h.length - 1][0] - flatSince) / 3600000;
    const st = flatH >= 2 * FARM_INACTIVE_H ? 'NEAKTYVUS' : flatH >= FARM_INACTIVE_H ? 'galbūt neaktyvus' : 'aktyvus';
    return { st, d24, span, flatH };
  }
  function showFarms() {
    const old = document.getElementById('abFarms'); if (old) { old.remove(); return; }
    const v = vget('xy', null) || { x: 0, y: 0 };
    const farms = jget('farms', {});
    const rank = { NEAKTYVUS: 0, 'galbūt neaktyvus': 1, naujas: 2, aktyvus: 3 };
    const rows = Object.values(farms).map(f => ({ ...f, ...farmStatus(f), dist: Math.hypot(f.x - v.x, f.y - v.y), pop: (f.hist[f.hist.length - 1] || [0, 0])[1] }))
      .sort((a, b) => (rank[a.st] - rank[b.st]) || (a.dist - b.dist));
    const box = document.createElement('div');
    box.id = 'abFarms';
    box.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:100000;background:#fffaf0;color:#222;border:2px solid #864;border-radius:8px;padding:10px;max-height:75vh;overflow:auto;font:12px sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.4);min-width:640px';
    const esc = t => String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const color = st => st === 'NEAKTYVUS' ? '#c00' : st === 'galbūt neaktyvus' ? '#b60' : st === 'naujas' ? '#666' : '#383';
    box.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><b>Potencialios fermos (${rows.length} kaimų)</b><button id="abFarmsX" style="border:0;background:#864;color:#fff;border-radius:4px;padding:2px 8px;cursor:pointer">✕</button></div>
      <div style="color:#555;margin-bottom:6px">„Neaktyvus“ – gyventojai neauga ${2 * FARM_INACTIVE_H}+ val.; „galbūt“ – ${FARM_INACTIVE_H}+ val. Stebima kas ~${Math.round(FARM_EVERY[0] / 60)}–${Math.round(FARM_EVERY[1] / 60)} val.</div>
      <table style="border-collapse:collapse;width:100%"><tr style="background:#eadbc8"><th style="text-align:left;padding:3px">Būsena</th><th style="text-align:left">Žaidėjas</th><th style="text-align:left">Kaimas</th><th>Koord.</th><th>Atst.</th><th>Gyv.</th><th>Per 24 h</th><th>Neauga</th><th style="text-align:left">Aljansas</th><th style="text-align:left">Gentis</th></tr>
      ${rows.map(r => `<tr style="border-top:1px solid #e5d8c5"><td style="padding:3px;color:${color(r.st)};font-weight:bold">${r.st}</td><td>${esc(r.player)}</td><td>${esc(r.name)}</td><td style="text-align:center"><a href="/karte.php?x=${r.x}&y=${r.y}">${r.x}|${r.y}</a></td><td style="text-align:right">${r.dist.toFixed(1)}</td><td style="text-align:right">${r.pop}</td><td style="text-align:right">${r.d24 === null ? '–' : (r.d24 > 0 ? '+' : '') + r.d24}</td><td style="text-align:right">${r.flatH === undefined ? '–' : Math.round(r.flatH) + ' h'}</td><td>${esc(r.ally)}</td><td>${esc(r.tribe)}</td></tr>`).join('')}
      </table>`;
    document.body.appendChild(box);
    document.getElementById('abFarmsX').onclick = () => box.remove();
  }

  function villagePop() {
    const m = (document.body.innerText || '').match(/(?:Population|Gyventojų skaičius):*\s*([\d.,\u202a-\u202e]+)/i);
    return m ? parseInt(m[1].replace(/\D/g, ''), 10) || 0 : 0;
  }
  // ===== KARIŲ GAMYBA PAGAL KAIMĄ (mygtukas „Kariai“) =====
  // Kiekvienam kaimui: AUTO (skripto logika), IŠJUNGTA arba PASIRINKTA (tavo kariai ir „iki kiek“ – skaičiuojami visi šio kaimo kariai: namie ir išėję)
  const UNITS_R = {
    t1: { n: 'Legionierius', g: 19, up: 1 }, t2: { n: 'Pretorionas', g: 19, up: 1 }, t3: { n: 'Imperionas', g: 19, up: 1 },
    t4: { n: 'Raitas legatas', g: 20, up: 2 }, t5: { n: 'Imperatoriaus raitelis', g: 20, up: 3 }, t6: { n: 'Cezario raitelis', g: 20, up: 4 },
    t7: { n: 'Mūradaužys', g: 21, up: 3 }, t8: { n: 'Ugninė katapulta', g: 21, up: 6 },
  };
  const CUSTOM_SHARE = 0.25;         // PASIRINKTA: vienu kartu – iki tokios atsargų dalies
  const CUSTOM_MAX_BATCH = 40;       // ir ne daugiau tiek vienetų
  const CUSTOM_EVERY = [20, 40];     // kas kiek min. tikrinti
  // REZERVAS KARIAMS: kai kaime gaminami kariai, TRAIN_RES_PCT valandinės gamybos (kiekvienos žaliavos) atidedama kariams –
  // statybos šių resursų neliečia (laukia, kol virš rezervo užteks). Rezervas kaupiasi iki TRAIN_RES_CAP_H valandų, treniruojant – sunaudojamas
  const TRAIN_RES_PCT = 0.6, TRAIN_RES_CAP_H = 3, TRAIN_RES_MAX_BATCH = 200;
  function trainActive() {
    if (!GM_getValue('trainOn', true) || !GM_getValue('buildOn', true) || settlerSaving()) return false;
    const tc = trainCfgFor(DID);
    if (tc.mode === 'off') return false;
    if (tc.mode === 'custom') {
      const lv = vget('blv', {}) || {}, full = vget('trainFull', {}) || {};
      return Object.entries(tc.units || {}).some(([u, m]) => m > 0 && UNITS_R[u] && (lv[UNITS_R[u].g] || 0) >= 1 && !(full[u] > Date.now()));
    }
    return MILITARY_ROLES.includes(ROLE);
  }
  // dorf1: rezervas papildomas pagal praėjusį laiką ir valandinę gamybą (#production); grąžina [mediena, molis, geležis, grūdai]
  function trainReserve() {
    const now = Date.now();
    let r = vget('trainRes', null) || { r: [0, 0, 0, 0], ts: now };
    if (!trainActive()) { vset('trainRes', { r: [0, 0, 0, 0], ts: now }); return [0, 0, 0, 0]; }
    const prod = [...document.querySelectorAll('#production .num')].map(e => parseInt(clean(e.textContent).replace(/[^\d-]/g, ''), 10) || 0);
    if (prod.length >= 4) {
      const h = Math.max(0, Math.min(now - (r.ts || now), 2 * 3600000)) / 3600000;
      r = { r: r.r.map((v, i) => Math.min(v + Math.max(0, prod[i]) * TRAIN_RES_PCT * h, Math.max(0, prod[i]) * TRAIN_RES_PCT * TRAIN_RES_CAP_H)), ts: now, prod: prod.slice(0, 4) };
      vset('trainRes', r);
    }
    return r.r.map(v => Math.round(v));
  }
  function trainCfgFor(did) {
    const c = jget('trainCfg', {})[did];
    if (c && c.mode) return c;
    return { mode: roleOf(did) === 'HAMMER' && !HAMMER_TRAIN ? 'off' : 'auto', units: {} };
  }
  async function ownedTroops() {                                         // visi šio kaimo kariai (namie + išėję + grįžtantys) iš Susibūrimo vietos
    try {
      const h = await fetch('/build.php?gid=16&tt=1', { credentials: 'include' }).then(r => r.text());
      const d = new DOMParser().parseFromString(h, 'text/html');
      const name = ownVillageName(), c = {};
      for (const t of d.querySelectorAll('table.troop_details')) {
        const role = clean((t.querySelector('thead td.role') || {}).textContent || '').trim();
        if (!name || role !== name) continue;
        [...t.querySelectorAll('tbody.units tr td.unit')].forEach((td, i) => { const k = 't' + (i + 1); c[k] = (c[k] || 0) + (parseInt(clean(td.textContent).replace(/\D/g, ''), 10) || 0); });
      }
      const all = jget('troopCnts', {}); all[DID] = { ts: Date.now(), c }; jset('troopCnts', all);
      return c;
    } catch (e) { return null; }
  }
  function queuedOnPage(unit) {                                          // šiame pastate jau treniruojami (eilėje)
    const num = unit.slice(1);
    return [...document.querySelectorAll('table.under_progress tr, .under_progress tr')].filter(r => r.querySelector(`img.u${num}`))
      .reduce((a, r) => a + (parseInt((clean(r.textContent).match(/\d+/) || ['0'])[0], 10) || 0), 0);
  }
  // Keli kariai „PASIRINKTA“: renkamas tas, kuriam iki šiol IŠLEISTA MAŽIAUSIAI resursų (lygiai resursų kiekvienam tipui, ne vienetų).
  // Naujai pridėtas tipas pradeda nuo mažiausios esamos sumos (kad ilgai negamintų vien jo).
  function pickBalanced(units, spent) {
    if (!units.length) return [];
    const known = units.filter(([u]) => spent[u] != null).map(([u]) => spent[u]);
    const base = known.length ? Math.min(...known) : 0;
    for (const [u] of units) if (spent[u] == null) spent[u] = Math.max(0, base - 1);   // naujas tipas – vos mažiau už mažiausią (pirmas eina jis, paskui – lygiai)
    return units.slice().sort((a, b) => spent[a[0]] - spent[b[0]])[0];
  }
  function trainCustom(tc) {
    if (!GM_getValue('trainOn', true) || Date.now() < (vget('trainNext', 0) || 0)) return false;
    const fcEl = document.getElementById('stockBarFreeCrop');
    const fc = fcEl ? parseInt(clean(fcEl.textContent).replace(/[^\d-]/g, ''), 10) : 0;
    const lv = vget('blv', {}) || {}, full = vget('trainFull', {}) || {};
    const units = Object.entries(tc.units || {}).filter(([u, m]) => m > 0 && UNITS_R[u] && (lv[UNITS_R[u].g] || 0) >= 1 && !(full[u] > Date.now()));
    if (!units.length) return false;
    const spent = vget('trainSpent', {}) || {};
    const [u, target] = pickBalanced(units, spent);
    if (!u) return false;
    vset('trainSpent', spent);
    const war = !GM_getValue('buildOn', true);                            // karo režimas – treniruoti dažnai ir beveik viskuo
    vset('trainNext', Date.now() + rand(...(war ? [4, 8] : CUSTOM_EVERY)) * 60000);
    jset('trainPlan', { unit: u, label: UNITS_R[u].n, share: war ? 0.9 : CUSTOM_SHARE, max: war ? 300 : CUSTOM_MAX_BATCH, target });
    startChore('train', '/build.php?gid=' + UNITS_R[u].g);
    return true;
  }
  function showTrainPanel() {
    const old = document.getElementById('abTrain'); if (old) { old.remove(); return; }
    const vil = [...document.querySelectorAll('#sidebarBoxVillageList .listEntry.village')].map(e => ({ did: e.getAttribute('data-did'), name: clean((e.querySelector('.name') || {}).textContent || '').trim() })).filter(v => v.did);
    let cur = DID;
    const box = document.createElement('div');
    box.id = 'abTrain';
    box.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:100000;background:#f6fff4;color:#222;border:2px solid #686;border-radius:8px;padding:10px;font:12px sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.4);min-width:380px';
    const render = () => {
      const tc = trainCfgFor(cur), cnt = (jget('troopCnts', {})[cur] || {}), on = GM_getValue('trainOn', true);
      box.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><b>Karių gamyba</b><button id="abTrX" style="border:0;background:#686;color:#fff;border-radius:4px;padding:2px 8px;cursor:pointer">✕</button></div>
        <div style="margin-bottom:6px"><button id="abTrAll" style="border:0;border-radius:4px;padding:3px 8px;color:#fff;cursor:pointer;background:${on ? '#686' : '#a44'}">Visi kaimai: ${on ? 'ĮJUNGTA' : 'IŠJUNGTA'}</button></div>
        <div style="margin-bottom:6px">Kaimas: <select id="abTrV">${vil.map(v => `<option value="${v.did}"${v.did === cur ? ' selected' : ''}>${v.name} (${roleOf(v.did)})</option>`).join('')}</select></div>
        <div style="margin-bottom:6px">${[['auto', 'AUTO (skripto logika)'], ['off', 'IŠJUNGTA'], ['custom', 'PASIRINKTA']].map(([m, t]) => `<label style="margin-right:10px"><input type="radio" name="abTrM" value="${m}"${tc.mode === m ? ' checked' : ''}> ${t}</label>`).join('')}</div>
        <table id="abTrU" style="border-collapse:collapse;width:100%;${tc.mode === 'custom' ? '' : 'opacity:.4'}"><tr style="background:#dfeedd"><th style="text-align:left;padding:3px">Karys</th><th>Turi${cnt.ts ? ' (' + hhmm(cnt.ts) + ')' : ''}</th><th>Iki kiek (0 – negaminti)</th></tr>
        ${Object.entries(UNITS_R).map(([u, d]) => `<tr style="border-top:1px solid #cdc"><td style="padding:3px">${d.n}</td><td style="text-align:center">${cnt.c && cnt.c[u] != null ? cnt.c[u] : '–'}</td><td style="text-align:center"><input data-u="${u}" type="number" min="0" step="10" value="${(tc.units || {})[u] || 0}" style="width:70px"></td></tr>`).join('')}</table>
        ${(() => {
          const all = jget('troopCnts', {}), names = { ...Object.fromEntries(Object.entries(UNITS_R).map(([u, d]) => [u, d.n])), t9: 'Senatorius', t10: 'Kolonistas' };
          const cols = vil.filter(v => all[v.did]);
          if (!cols.length) return '<div style="color:#555;margin:6px 0">Karių suvestinė atsiras, kai skriptas apeis kaimus (~15 min.).</div>';
          const rows = Object.keys(names).filter(u => cols.some(v => (all[v.did].c || {})[u]));
          const tot = u => cols.reduce((a, v) => a + ((all[v.did].c || {})[u] || 0), 0);
          return `<div style="margin:8px 0 3px"><b>Visi kariai</b> <span style="color:#555">(namie + išėję + grįžtantys)</span></div>
          <table style="border-collapse:collapse;width:100%"><tr style="background:#dfeedd"><th style="text-align:left;padding:3px">Karys</th>${cols.map(v => `<th>${v.name}<br><span style="font-weight:normal;color:#666">${hhmm(all[v.did].ts)}</span></th>`).join('')}<th>Iš viso</th></tr>
          ${rows.length ? rows.map(u => `<tr style="border-top:1px solid #cdc"><td style="padding:3px">${names[u]}</td>${cols.map(v => `<td style="text-align:center">${(all[v.did].c || {})[u] || 0}</td>`).join('')}<td style="text-align:center;font-weight:bold">${tot(u)}</td></tr>`).join('') : `<tr><td colspan="${cols.length + 2}" style="padding:3px;color:#555">karių nėra</td></tr>`}</table>`;
        })()}
        <div style="color:#555;margin:6px 0">„Turi“ – visi šio kaimo kariai (namie ir išėję), atnaujinama kai skriptas treniruoja. Vienu kartu – iki ${Math.round(CUSTOM_SHARE * 100)} % atsargų, tikrinama kas ${CUSTOM_EVERY[0]}–${CUSTOM_EVERY[1]} min. Grūdų balansas netikrinamas. Įsikūrėjai ir gelbėjimas nuo puolimo veikia visada.</div>
        <button id="abTrS" style="border:0;background:#686;color:#fff;border-radius:4px;padding:4px 12px;cursor:pointer;font-weight:bold">Išsaugoti</button> <span id="abTrOk" style="color:#383"></span>`;
      box.querySelector('#abTrX').onclick = () => box.remove();
      box.querySelector('#abTrAll').onclick = () => { GM_setValue('trainOn', !GM_getValue('trainOn', true)); render(); };
      box.querySelector('#abTrV').onchange = e => { cur = e.target.value; render(); };
      box.querySelectorAll('input[name=abTrM]').forEach(r => r.onchange = () => { box.querySelector('#abTrU').style.opacity = r.value === 'custom' && r.checked ? '1' : '.4'; });
      box.querySelector('#abTrS').onclick = () => {
        const mode = (box.querySelector('input[name=abTrM]:checked') || {}).value || 'auto';
        const units = {}; box.querySelectorAll('#abTrU input[data-u]').forEach(i => { const v = Math.max(0, parseInt(i.value, 10) || 0); if (v) units[i.dataset.u] = v; });
        const all = jget('trainCfg', {}); all[cur] = { mode, units }; jset('trainCfg', all);
        GM_setValue('trainNext@' + cur, 0); GM_setValue('trainFull@' + cur, {});
        box.querySelector('#abTrOk').textContent = 'išsaugota';
      };
    };
    render();
    document.body.appendChild(box);
    ownedTroops().then(c => { if (c && document.getElementById('abTrain')) render(); });   // šio kaimo skaičiai – iškart
  }
  // Badas: grūdų gamyba neigiama ir klėtis ištuštės per < STARVE_H val. – naujų karių nedarom (jie tik paspartintų badą; žaidimas pradeda žudyti karius)
  const STARVE_H = 6;
  function starveRisk() {
    const fcEl = document.getElementById('stockBarFreeCrop'); if (!fcEl) return false;
    const fc = parseInt(clean(fcEl.textContent).replace(/[^\d-]/g, ''), 10);
    if (!(fc < 0)) return false;
    const crop = num(document.getElementById('l4'));
    return crop < -fc * STARVE_H;
  }
  function trainChore() {
    if (starveRisk()) { setStatus(`DĖMESIO: grūdų balansas neigiamas, klėtis ištuštės per < ${STARVE_H} val. – kariai negaminami`); return false; }
    const tc = trainCfgFor(DID);
    if (tc.mode === 'off') return false;
    if (tc.mode === 'custom') return trainCustom(tc);
    if (settleFocus()) return false;                                     // taupom Rezidencijai ir įsikūrėjams
    if (ROLE === 'RESOURCE') return trainOtherRole();
    if (!MILITARY_ROLES.includes(ROLE)) return false;
    if (!GM_getValue('trainOn', true) || Date.now() < (vget('trainNext', 0) || 0)) return false;
    const pop = villagePop();
    if (pop && pop < TRAIN_START_POP) return false;
    const fcEl = document.getElementById('stockBarFreeCrop');
    const fc = fcEl ? parseInt(clean(fcEl.textContent).replace(/[^\d-]/g, ''), 10) : 0;
    if (settlerSaving()) return false;                                    // taupom įsikūrėjams
    vset('trainNext', Date.now() + rand(...(GM_getValue('buildOn', true) ? TRAIN_EVERY : [4, 8])) * 60 * 1000);
    const done = resDone(), lv = vget('blv', {}) || {};
    // žvalgai: namie + išsiųsti mūsų žvalgybai (dar negrįžę); išsiųsti kitur ranka (pvz. pastiprinimui) – nebeskaičiuojami
    const scoutsHave = homeTroops(RE_LEG) + (SCOUTS_COUNT_OUT ? scoutsOut() : 0);
    if ((lv[20] || 0) >= 1 && done.legati && scoutsHave < SCOUTS_WANT) {
      jset('trainPlan', { unit: 't4', label: 'žvalgų', exact: Math.max(1, SCOUTS_WANT - scoutsHave) });
      startChore('train', '/build.php?gid=20');
    } else if ((lv[20] || 0) >= 1 && done.imperatoris && EI_TRAIN_ROLES.includes(ROLE)) {
      const rush = eiRush();
      if (rush) vset('trainNext', Date.now() + rand(6, 12) * 60 * 1000);        // kepimo metu – dažnai ir daug
      jset('trainPlan', { unit: 't5', label: 'Imperatoriaus raitelių', share: rush ? EI_RUSH_SHARE : EI_TRAIN_SHARE, max: rush ? 30 : 10 });
      startChore('train', '/build.php?gid=20');
    } else if (AUTO_LEGIONS) {
      jset('trainPlan', { unit: TRAIN_UNIT, label: 'legionierių', share: TRAIN_SHARE, max: TRAIN_MAX_BATCH });
      startChore('train', '/build.php?gid=19');
    } else return false;
    return true;
  }
  // HAMMER: Imperionai (Kareivinės) – nuolat, kai yra resursų; RESURSINIS: Pretorijonai iki PRAET_MAX tik iš pertekliaus
  function trainOtherRole() {
    if (!GM_getValue('trainOn', true) || Date.now() < (vget('trainNext', 0) || 0)) return false;
    const lv = vget('blv', {}) || {}, done = resDone();
    if (!(lv[19] >= 1)) return false;
    const fcEl = document.getElementById('stockBarFreeCrop');
    const fc = fcEl ? parseInt(clean(fcEl.textContent).replace(/[^\d-]/g, ''), 10) : 0;
    vset('trainNext', Date.now() + rand(...(GM_getValue('buildOn', true) ? TRAIN_EVERY : [4, 8])) * 60 * 1000);
    if (ROLE === 'HAMMER') {
      if (!done.imperian) return false;
      jset('trainPlan', { unit: 't3', label: 'Imperionų', share: HAMMER_SHARE, max: HAMMER_MAX_BATCH });
    } else {
      if (!done.praetorian) return false;
      const st = stockInfo();
      if (Math.max(st.r[0], st.r[1], st.r[2]) < PRAET_FILL) return false;
      const have = homeTroops(/Pretorion\S*|Praetorian\S*/);
      if (have >= PRAET_MAX) return false;
      jset('trainPlan', { unit: 't2', label: 'Pretorijonų', share: PRAET_SHARE, max: Math.min(50, PRAET_MAX - have) });
    }
    startChore('train', '/build.php?gid=19');
    return true;
  }
  async function onTrain() {
    const setV = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    if (chorePending('trainDone')) {
      GM_setValue('chore', ''); await sleep(rand(1500, 3000));
      if (GM_getValue('afterTrain', '') === 'supply') { GM_setValue('afterTrain', ''); return startChoreFast('supply', '/build.php?gid=17&t=5'); }   // gelbėjimas: likutis – į kitą kaimą
      return finishChore();
    }
    GM_setValue('chore', '');
    await sleep(rand(2500, 6000));
    const plan = jget('trainPlan', null) || { unit: TRAIN_UNIT, label: 'legionierių', share: TRAIN_SHARE, max: TRAIN_MAX_BATCH };
    if (!GM_getValue('buildOn', true) && !plan.dump) { plan.share = Math.max(plan.share || 0, 0.9); plan.max = Math.max(plan.max || 0, 300); }   // karo režimas – resursai kariams
    if (plan.unit === 't10') {                                            // rezidencija: kiek įsikūrėjų jau yra
      const t = clean(document.body.innerText).replace(/\s+/g, ' ');
      const pm = t.match(/(?:Settler|Kolonist\S*)\s*(?:Lygis\s*\d+\s*)?\((?:present|turim\S*|Yra)?:?\s*(\d+)\)/i);   // kaip Arklidėje: „Imperatoriaus raitelis Lygis 0 (Yra: 0)“              // lietuviško užrašo dar nežinau – jei neatpažinta, skaičiaus neperrašom
      const queued = [...document.querySelectorAll('.under_progress tr, table.under_progress tbody tr, .trainingQueue tr')].filter(r => /Settler|Kolonist/i.test(r.textContent)).reduce((a, r) => a + (parseInt(clean(r.textContent).replace(/[^\d ]/g, ' ').trim().split(/\s+/)[0], 10) || 1), 0);
      if (pm) stSet({ ...stGet(), have: +pm[1] + queued });
      const haveS = stGet().have || 0;
      if (haveS >= 3) { setStatus(`įsikūrėjų jau ${haveS}/3`); return finishChore(); }
    }
    const inp = document.querySelector(`input[name=${plan.unit}]`);
    const btn = document.querySelector('button.startTraining');
    if (!inp || !btn) {
      if (plan.target) { const f = vget('trainFull', {}) || {}; f[plan.unit] = Date.now() + 120 * 60000; vset('trainFull', f); }   // neištirta ar pastato nėra – 2 val. nebandyti
      setStatus(`kariai: ${plan.label} forma nerasta (neištirta?)`); return finishChore();
    }
    const det = inp.closest('.details') || inp.parentElement.parentElement;
    const nums = [...det.querySelectorAll('*')].filter(e => e.children.length === 0 && /^\s*[\d\u202a-\u202e\u200e,.]+\s*$/.test(e.textContent)).map(e => parseInt(e.textContent.replace(/\D/g, ''), 10) || 0);
    const cost = nums.slice(0, 4);
    if (cost.length < 4 || cost.some(c => !c)) { setStatus('kariai: kainos neperskaičiau – netreniruoju'); return finishChore(); }
    if (plan.unit === 't10') stSet({ ...stGet(), cost });
    const have = [1, 2, 3, 4].map(i => num(document.getElementById('l' + i)));
    const fcEl = document.getElementById('stockBarFreeCrop');
    const fc = fcEl ? parseInt(clean(fcEl.textContent).replace(/[^\d-]/g, ''), 10) : 0;
    let n;
    if (plan.dump) {
      // GELBĖJIMAS: kiek įmanoma iš VISŲ resursų, bet grūdų balansas neturi tapti neigiamas (kitaip kariai badautų)
      const upk = { t1: 1, t2: 1, t3: 1, t4: 2, t5: 3, t6: 4 }[plan.unit] || 1;
      n = Math.min(Math.floor(Math.min(...have.map((h, i) => h / cost[i]))), Math.floor(Math.max(0, fc) / upk), DUMP_MAX_UNITS);
      // ar po šio treniravimo dar liks daug virš slėptuvės? (skaičiuojam IŠ ANKSTO – paspaudus puslapis persikrauna)
      const hide = crannyCap();
      const left = have.map((h, i) => h - Math.max(0, n) * cost[i]);
      const over = left.reduce((a, h) => a + Math.max(0, h - hide), 0);
      // likutis virš slėptuvės: PIRMIAUSIA – išsiųsti į kitą savo kaimą (nemokamai, nevalgo grūdų); tik jei kito kaimo nėra – NPC → kariai
      const ov = otherVillage();
      const needSend = (plan.stage || 1) === 1 && over >= DUMP_SEND_MIN && !!ov;
      const needNpc = !needSend && (plan.stage || 1) === 1 && over >= DUMP_NPC_MIN && (Math.max(0, fc) - Math.max(0, n) * upk) >= upk;
      if (needNpc) jset('npcRatio', { cost, plan: { ...plan }, url: location.pathname + location.search });
      if (needSend) jset('supplyPlan', { did: ov.did, x: ov.x, y: ov.y, send: left.slice(0, 3).map(h => Math.max(0, Math.floor(h - hide))), crop: Math.max(0, Math.floor(left[3] - hide)), dump: true });
      if (n >= 1) {
        setV(inp, String(n)); await sleep(rand(500, 1000));
        GM_setValue('chore', needNpc ? 'npc' : 'trainDone'); GM_setValue('choreTs', Date.now()); GM_setValue('navTs', Date.now());
        if (needSend) GM_setValue('afterTrain', 'supply');
        log(`Gelbėjimas (${plan.stage || 1}): treniruojama ${n} × ${plan.unit}` + (needSend ? `, likutis (~${over}) – į kaimą ${ov.x}|${ov.y}` : needNpc ? `, po to NPC (virš slėptuvės liks ~${over})` : ''));
        setStatus(`PUOLIMAS ARTĖJA – resursai į karius: ${n} ${plan.label}`);
        btn.click();
        return;
      }
      if (needSend) return startChoreFast('supply', '/build.php?gid=17&t=5');
      if (needNpc) return startChoreFast('npc', '/build.php?gid=17&t=0');
      setStatus(`gelbėjimas: daugiau karių neišlaikytų (grūdai) – virš slėptuvės liko ~${over}`);
      return finishChore();
    }
    if (plan.exact) n = Math.min(plan.exact, Math.floor(Math.min(...have.map((h, i) => h / cost[i]))));
    else {
      const tr = ((vget('trainRes', null) || {}).r) || [0, 0, 0, 0];
      const nShare = Math.min(Math.floor(Math.min(...have.map((h, i) => (h * plan.share) / cost[i]))), plan.max);
      const nRes = Math.min(Math.floor(Math.min(...have.map((h, i) => Math.max(h * plan.share, Math.min(h, tr[i])) / cost[i]))), TRAIN_RES_MAX_BATCH);   // bent rezervas kariams
      n = Math.max(nShare, nRes);
    }
    // grūdų balanso nebetikrinam – jį tvarko turgus ir statybos (tavo sprendimas)
    if (plan.target) {                                                    // PASIRINKTA: iki nurodyto skaičiaus (namie + išėję + eilėje)
      const own = await ownedTroops();
      if (!own) { setStatus('kariai: nepavyko suskaičiuoti turimų – palauksiu'); return finishChore(); }
      const have = (own[plan.unit] || 0) + queuedOnPage(plan.unit), need = plan.target - have;
      if (need <= 0) { const f = vget('trainFull', {}) || {}; f[plan.unit] = Date.now() + 30 * 60000; vset('trainFull', f); setStatus(`kariai: ${plan.label} jau ${have}/${plan.target}`); return finishChore(); }
      n = Math.min(n, need);
    }
    if (n < 1) { setStatus('kariai: per mažai pertekliaus – palauksiu'); return finishChore(); }
    setV(inp, String(n));
    await sleep(rand(800, 2000));
    GM_setValue('chore', 'trainDone'); GM_setValue('choreTs', Date.now()); GM_setValue('navTs', Date.now());
    log(`Treniruojama: ${n} × ${plan.unit}`);
    { const r = vget('trainRes', null); if (r && r.r) { r.r = r.r.map((v, i) => Math.max(0, v - n * cost[i])); vset('trainRes', r); } }   // rezervas sunaudotas
    if (plan.target) { const sp = vget('trainSpent', {}) || {}; sp[plan.unit] = (sp[plan.unit] || 0) + n * cost.reduce((a, b) => a + b, 0); vset('trainSpent', sp); }   // resursų balansui tarp tipų
    if (plan.unit === 't10') { const st = stGet(); stSet({ ...st, have: (st.have || 0) + n }); }
    setStatus(`treniruojama: ${n} ${plan.label}`);
    btn.click();
  }

  // Kai oazės įjungtos ir OASIS_FIRST – į nuotykį tik tada, kai paskutinė oazių paieška nieko nerado (ar hero per silpnas)
  function advAllowed() {
    if (!oasisTurn() || GM_getValue('oasisMode', 'on') === 'off') return true;
    return Date.now() - (GM_getValue('oasisNoneTs', 0) || 0) < 25 * 60000;
  }

  function oasisChore() {
    if (ROLE !== 'RESOURCE_START') return false;                        // herojus gyvena 1 kaime – oazės siunčiamos tik iš ten
    if (attackInMin() < HOLD_HERO_OASIS_MIN || heroHold()) return false;
    const starved = Date.now() - (GM_getValue('starvedTs', 0) || 0) < 3 * 60000;
    const due = Date.now() >= (GM_getValue('oasisNext', 0) || 0) || (starved && Date.now() - (GM_getValue('oasisLast', 0) || 0) > 3 * 60000);
    if (GM_getValue('oasisMode', 'on') === 'off' || !heroAtHome() || !due) return false;
    GM_setValue('oasisLast', Date.now());
    GM_setValue('oasisNext', Date.now() + rand(...OASIS_EVERY) * 60 * 1000);
    const v = villageXY();
    if (!v) return false;
    GM_setValue('eiHome', homeTroops(RE_EI));                         // kiek Imperatoriaus raitelių gali eiti kartu su herojumi
    jset('infHome', { t3: homeTroops(/(?:Imperion\S*|Imperian\S*)/), t1: defHome() ? 0 : homeTroops(/Legionier\S*|Legionnaire\S*/) });   // pėstininkai „armijai“ (gynėjai – tik jei leidžiama)
    startChore('oasisScan', `/karte.php?x=${v.x}&y=${v.y}`);
    return true;
  }

  // Bendrųjų užduočių atlygiai ir herojaus kuprinės resursai – tik NAUJAUSIAM kaimui (didžiausias kaimo ID), kad jam nereikėtų vežti resursų
  // Kuriam kaimui atiduoti kuprinės resursus ir užduočių atlygius: pasirenkama mygtuku „Kuprinė → …“ (AUTO – naujausias kaimas)
  const heroResDid = () => { const vs = allVillages(), c = GM_getValue('heroResVil', 'auto'); return c !== 'auto' && vs.includes(c) ? c : (BONUS_TO_NEW ? vs[vs.length - 1] : DID); };
  const notNewest = () => { const vs = allVillages(); return vs.length > 1 && DID !== heroResDid(); };
  function maybeChores() {
    // Aukcionas baigiasi per kelias minutes – tai skubiausia (eilės ratu laukti negalima, kitaip taikinys pasensta)
    { const t = jget('aucTarget', null);
      if (t && GM_getValue('aucMode', 'test') !== 'off') { jset('aucTarget', null); if (Date.now() - t.ts < 180000) { startChore('auction', t.url); return true; } } }
    // Užduočių burbulas (!) – surinkti atlygį ir netrukus perkelti iš kuprinės į sandėlį
    if (COLLECT_TASKS && questBadge() && Date.now() >= (GM_getValue('questBadgeNext', 0) || 0)) {
      GM_setValue('questBadgeNext', Date.now() + rand(10, 18) * 60 * 1000);
      vset('taskNext', Date.now() + rand(...TASK_EVERY) * 60 * 1000);
      vset('heroResNext', Date.now() + rand(2, 4) * 60 * 1000);
      startChore('tasks', '/tasks?t=village');
      return true;
    }
    // Žvaigždutė – eiti skirstyti taškų (ne dažniau kaip kas ~12 min, kad nesisuktų ratu, jei kas nepavyksta)
    if (HERO_POINTS && heroStar() && Date.now() >= (GM_getValue('starNext', 0) || 0)) {
      GM_setValue('starNext', Date.now() + rand(12, 20) * 60 * 1000);
      startChore('heroAttrs', '/hero/attributes');
      return true;
    }
    { const ob = jget('oasisBefore', null);          // herojus grįžo iš oazės – išmatuoti sveikatos nuostolį
      if (ob && heroAtHome() && Date.now() - ob.ts > 3 * 60000 && Date.now() >= (GM_getValue('oasisMeasNext', 0) || 0)) {
        GM_setValue('oasisMeasNext', Date.now() + rand(4, 8) * 60000);
        startChore('heroAttrs', '/hero/attributes');
        return true;
      } }
    reportsChore();                                   // plėšimų ataskaitos (be naršymo)
    friendsChore();                                   // aljansas, sąjungos, paktai – kad jų nepultume (be naršymo)
    statsChore();                                     // pelno suvestinė (be naršymo)
    allyReportsChore();                               // aljanso „Užpuolimai“ – žvalgyba be savo žvalgų
    if (dailyChore()) return true;
    if (prodBonusChore()) return true;
    if (settlerChore()) return true;
    if (cpChore()) return true;
    if (celebrationChore()) return true;
    if (researchChore()) return true;
    if (vlChore()) return true;                     // Aukso klubo sąrašas „Kaimai“ – saugūs taikiniai vienu paspaudimu
    // Ratu (round-robin): po kiekvieno atlikto darbo kitą kartą pirmenybė – KITAM. Anksčiau žvalgai (raidChore kas 1–3 min.)
    // visada laimėdavo, ir legionierių sąrašas, kariai, turgus, oazės nesulaukdavo eilės (316 legionierių stovėjo namie).
    const RR = [
      ['raid', () => raidChore()],
      ['fl', () => FARM_LIST_MODE ? farmListChore() : emptyOasisChore()],
      ['eiIdle', () => FARM_LIST_MODE && eiIdleOasisChore()],              // laisvi EI (kol nėra žaidėjų fermų) – tolimesnės oazės
      ['supply', () => supplyChore()], ['auc', () => aucChore()], ['demo', () => demolishChore()], ['trade', () => tradeChore()],
      ['bal', () => balanceChore()], ['train', () => trainChore()], ['farm', () => farmChore()], ['site', () => siteChore()],
      ['oasis', () => oasisTurn() && oasisChore()],
    ];
    { const st = (GM_getValue('rrNext', 0) || 0) % RR.length;
      for (let i = 0; i < RR.length; i++) { const j = (st + i) % RR.length; if (RR[j][1]()) { GM_setValue('rrNext', j + 1); return true; } } }
    if (advAdsChore()) return true;                   // herojus nuotykyje – iš anksto reklamos kitam nuotykiui
    // Yra nuotykis (ženkliukas) – patikrinti anksčiau nei pagal įprastą grafiką
    if (hc().adv && advAllowed() && attackInMin() >= HOLD_HERO_ADV_MIN && !heroHold() && advBadge() && Date.now() >= (GM_getValue('advBadgeNext', 0) || 0)) {
      GM_setValue('advBadgeNext', Date.now() + rand(2, 4) * 60 * 1000);       // yra nuotykių – herojus grįžęs eina kitam iškart
      GM_setValue('advNext', Date.now() + rand(...ADV_EVERY) * 60 * 1000);
      startChore('advCheck', '/hero/adventures');
      return true;
    }
    if (hc().adv && advAllowed() && attackInMin() >= HOLD_HERO_ADV_MIN && !heroHold() && Date.now() >= (GM_getValue('advNext', 0) || 0)) {
      GM_setValue('advNext', Date.now() + rand(...ADV_EVERY) * 60 * 1000);
      startChore('advCheck', '/hero/adventures');
      return true;
    }
    if (COLLECT_TASKS && Date.now() >= (vget('taskNext', 0) || 0)) {
      vset('taskNext', Date.now() + rand(...TASK_EVERY) * 60 * 1000);
      startChore('tasks', '/tasks?t=village');
      return true;
    }
    if ((HERO_POINTS || HERO_AUTO_RES) && Date.now() >= (GM_getValue('heroAttrNext', 0) || 0)) {
      GM_setValue('heroAttrNext', Date.now() + rand(...HERO_ATTR_EVERY) * 60 * 1000);
      startChore('heroAttrs', '/hero/attributes');
      return true;
    }
    const starved = Date.now() - (GM_getValue('starvedTs', 0) || 0) < 3 * 60000;
    // herojaus kuprinės resursai keliauja į AKTYVŲ kaimą – kai yra naujesnių kaimų, 1 kaime jų neimam (jie skirti naujiems)
    if (HERO_RESOURCES && !notNewest() && (Date.now() >= (vget('heroResNext', 0) || 0) || (starved && Date.now() - (vget('heroResLast', 0) || 0) > 8 * 60000))) {
      vset('heroResLast', Date.now());
      vset('heroResNext', Date.now() + rand(...HERO_RES_EVERY) * 60 * 1000);
      const have = [1, 2, 3, 4].map(i => num(document.getElementById('l' + i)));
      const capEls = document.querySelectorAll('.capacity');
      const cw = num(capEls[0]), cg = num(capEls[1]);
      if (cw && cg && have.some((h, i) => h < (i < 3 ? cw : cg) * HERO_RES_BELOW)) {
        startChore('heroRes', '/hero/inventory');
        return true;
      }
    }
    if (!oasisTurn() && oasisChore()) return true;
    if (WANDER && Math.random() < 0.10 && Date.now() >= (GM_getValue('wanderNext', 0) || 0)) {
      GM_setValue('wanderNext', Date.now() + rand(25, 60) * 60000);
      const pages = ['/dorf2.php', '/statistics', '/report'];
      startChore('wander', pages[rand(0, pages.length - 1)]);
      return true;
    }
    return false;
  }

  async function onWander() {
    // Po pastato statybos centre žaidimas nukreipia į dorf2 – grįžtame į dorf1 (tik jei ką tik spaudėme statyti)
    if (!chorePending('wander')) {
      if (Date.now() - (GM_getValue('builtTs', 0) || 0) < 90000) later(rand(3, 8), () => (location.href = '/dorf1.php'));
      else {
        // Atsidūrėme čia be jokio darbo (pvz. po reklamos ar perkrovimo) – kad botas neužstrigtų, po 1–2,5 min. grįžtame į dorf1, jei tu nieko nedarai
        let act = Date.now();
        ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(ev => document.addEventListener(ev, () => { act = Date.now(); }, { passive: true }));
        const back = () => { if (!enabled()) return; if (Date.now() - act < 45000) return later(rand(30, 60), back); log('Sargas: neveikiu dorf2/ataskaitose – grįžtu į dorf1'); location.href = '/dorf1.php'; };
        later(rand(60, 150), back);
      }
      return;
    }
    GM_setValue('chore', '');
    await sleep(rand(6000, 35000));
    window.scrollBy(0, rand(100, 500));
    await sleep(rand(1500, 5000));
    finishChore();
  }

  async function onTasks() {
    if (!chorePending('tasks')) return;
    GM_setValue('chore', '');
    await sleep(rand(2000, 4000));
    let n = 0;
    const collectAll = async () => {
      for (let i = 0; i < 12; i++) {
        const b = document.querySelector('.task.achieved button.collect:not(.disabled), button.collect:not(.disabled)');
        if (!b) return;
        b.click(); n++;
        log('Paimtas užduoties atlygis');
        await sleep(rand(2500, 4500));
      }
    };
    await collectAll();
    // bendrųjų užduočių atlygis eina į aktyvų kaimą – kai yra naujesnis kaimas, 1 kaime jų nerenkam (surinks naujame kaime)
    const skipGeneral = notNewest();
    const tab = skipGeneral ? null : [...document.querySelectorAll('a.tabItem')].find(a => !a.classList.contains('active'));
    if (tab) { tab.click(); await sleep(rand(2500, 4000)); await collectAll(); }
    setStatus(n ? `paimta atlygių: ${n}` : 'atlygių nėra');
    finishChore();
  }

  // Narvai: kiek kuprinėje ir kiek uždėta (krepšio vieta – paskutinė įrangos vieta)
  function readCages() {
    // inventorius piešiamas vėliau – jei dar nenupieštas, nieko neperrašyti (kitaip narvų „būtų 0“)
    if (!document.querySelector('.heroItems .heroItem') || !document.querySelector('.equipmentSlots .heroItem')) {
      return { bagCnt: GM_getValue('cagesBag', 0) || 0, eqCnt: GM_getValue('cagesEq', 0) || 0, stale: true };
    }
    const bagIt = document.querySelector('.heroItems .item.item114');
    const bagCnt = bagIt ? parseInt(((bagIt.closest('.heroItem') || bagIt).querySelector('.count, [class*=count], [class*=amount]') || {}).textContent || '0', 10) || (bagIt ? 1 : 0) : 0;
    const eqIt = document.querySelector('.equipmentSlots .item.item114');
    const eqCnt = eqIt ? parseInt(((eqIt.closest('.heroItem') || eqIt).querySelector('.count, [class*=count], [class*=amount]') || {}).textContent || '0', 10) || 1 : 0;
    const oi = document.querySelector('.heroItems .item.item112');
    const oiCnt = oi ? parseInt(((oi.closest('.heroItem') || oi).querySelector('.count, [class*=count], [class*=amount]') || {}).textContent || '0', 10) || 1 : 0;
    GM_setValue('ointBag', oiCnt);
    GM_setValue('cagesBag', bagCnt); GM_setValue('cagesEq', eqCnt); GM_setValue('cagesDirty', 0);
    return { bagCnt, eqCnt };
  }
  async function waitInv() { for (let i = 0; i < 20 && !document.querySelector('.heroItems .heroItem'); i++) await sleep(500); }
  async function onCageCheck() {
    GM_setValue('chore', '');
    await sleep(rand(2500, 4500));
    await waitInv();
    const r = readCages();
    log('Narvai: kuprinėje', r.bagCnt, 'uždėta', r.eqCnt);
    const v = vget('xy', null);
    if (v && heroAtHome()) return startChore('oasisScan', `/karte.php?x=${v.x}&y=${v.y}`);
    finishChore();
  }
  async function onOintUse() {
    const setV = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    GM_setValue('chore', '');
    await sleep(rand(2500, 4500));
    readCages();
    const have = GM_getValue('ointBag', 0) || 0;
    const health = GM_getValue('heroHealth', 0) || 0;
    const use = Math.min(have, OINTMENT_MAX_USE, Math.max(0, Math.round(OINTMENT_TO - health)));
    const it = document.querySelector('.heroItems .item.item112');
    if (!it || use < 1) { setStatus('tepalų nėra arba nereikia'); return finishChore(); }
    (it.closest('.heroItem') || it).click();
    await sleep(rand(1500, 2500));
    const dlg = [...document.querySelectorAll('.dialogContents, .dialog')].find(e => e.offsetParent && e.querySelector('input') && e.querySelector('button'));
    const inp = dlg && dlg.querySelector('input');
    const btn = dlg && [...dlg.querySelectorAll('button')].find(b => /green/.test(b.className) && !/cancel|atšaukti/i.test(b.textContent));
    if (!inp || !btn) { setStatus('tepalo naudojimo langas kitoks – nenaudoju'); return finishChore(); }
    setV(inp, String(use));
    await sleep(rand(700, 1500));
    btn.click();
    await sleep(rand(2500, 4000));
    log(`Panaudota tepalų: ${use}`);
    GM_setValue('oasisNote', hhmm(Date.now()) + ` panaudota tepalų ${use}`);
    GM_setValue('heroHealthTs', 0);                       // perskaityti tikrą sveikatą iš naujo
    GM_setValue('oasisNext', 0);
    readCages();
    finishChore();
  }

  async function onCageEquip() {
    const setV = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    GM_setValue('chore', '');
    await sleep(rand(2500, 4500));
    await waitInv();
    const t = jget('oasisTarget', null);
    const before = readCages();
    const add = t && t.cage ? t.cage - before.eqCnt : 0;
    if (!t || add <= 0) { if (t) return startChore('oasisSend', `/build.php?id=39&gid=16&tt=2&x=${t.x}&y=${t.y}`); return finishChore(); }
    const bagIt = document.querySelector('.heroItems .item.item114');
    if (!bagIt || before.bagCnt < add) { setStatus('narvų kuprinėje per mažai'); return finishChore(); }
    (bagIt.closest('.heroItem') || bagIt).click();
    await sleep(rand(1500, 2500));
    // lietuviškai: langas „Narvas“, laukas „Uždedamų narvų skaičius“, mygtukai „Atšaukti“ / „Ekipuoti“ (patikrinta)
    const dlg = [...document.querySelectorAll('.dialogContents, .dialog, [class*=dialog]')].filter(e => e.offsetParent && /cage|narv/i.test(e.textContent) && e.querySelector('input') && e.querySelector('button'))
      .sort((a, b) => a.textContent.length - b.textContent.length)[0];
    const inp = dlg && dlg.querySelector('input');
    const eqBtn = dlg && [...dlg.querySelectorAll('button')].find(b => /^\s*(equip|ekipuoti)\s*$/i.test(b.textContent));
    if (!inp || !eqBtn) { setStatus('narvų uždėjimo langas kitoks – nedarau'); return finishChore(); }
    setV(inp, String(add));
    await sleep(rand(700, 1500));
    eqBtn.click();
    await sleep(rand(2500, 4000));
    const after = readCages();
    log('Narvai uždėti:', after.eqCnt);
    if (after.eqCnt < t.cage) { setStatus(`narvų uždėta tik ${after.eqCnt} – nesiunčiu`); return finishChore(); }
    GM_setValue('cagesDirty', 1);
    startChore('oasisSend', `/build.php?id=39&gid=16&tt=2&x=${t.x}&y=${t.y}`);
  }

  async function onInventory() {
    if (!chorePending('heroRes')) return;
    GM_setValue('chore', '');
    await sleep(rand(2000, 4000));
    // kuprinėje resursų daiktai rodo kiekį (pvz. 477); ieškom .item su skaičiumi ≥ 50 (tepalai/kiti turi mažiau)
    const cnt = e => parseInt(((e.querySelector('.count') || e).textContent || '').replace(/\D/g, ''), 10) || 0;
    const items = [...document.querySelectorAll('.item')].filter(e => e.offsetParent && cnt(e) >= 50);
    const byCls = document.querySelector('.item.item145, .item.item146, .item.item147, .item.item148');
    const item = (byCls && byCls.offsetParent ? byCls : null) || items[0];
    if (!item) { setStatus('kuprinėje resursų nėra'); vset('heroResNext', Date.now() + 60 * 60 * 1000); }
    else {
      item.click();
      await sleep(rand(1000, 1800));
      // paspaudus daiktą išsiskleidžia meniu: „panaudoti“ / „Informacija“ / „Rūšiuoti“
      const vis = e => e.offsetParent !== null;
      const useEl = [...document.querySelectorAll('button, a, li, div, span')].filter(vis)
        .find(e => e.children.length < 3 && /^(panaudoti|naudoti|use)$/i.test((e.textContent || '').trim()));
      if (useEl) { useEl.click(); await sleep(rand(1200, 2000)); }
      const dlgRoot = [...document.querySelectorAll('.dialogContents, .dialog, [class*=dialog]')].filter(vis)
        .find(e => /Perkelti resursus|Transfer resources/i.test(e.textContent || ''));
      if (!dlgRoot) { log('Perkėlimo dialogas neatsidarė'); setStatus('perkėlimo lango nerasta – nedarau'); }
      else {
        const bts = [...dlgRoot.querySelectorAll('button')].filter(vis);
        const max = bts.find(b => /didžiaus|daugiaus|maksim|maximum/i.test(b.textContent));
        if (!max) { log('Hero resursų langas, mygtukai:', bts.map(b => clean(b.textContent).trim()).join(' ; ')); setStatus('NEPAVYKO rasti „Perkelti didžiausią galimą kiekį“'); }
        else {
          max.click();
          await sleep(rand(1000, 1800));
          const tr = [...dlgRoot.querySelectorAll('button')].filter(vis).find(b => /^(perkelti|transfer)$/i.test(clean(b.textContent).trim()));
          if (tr && !tr.disabled && !/disabled/.test(tr.className)) { tr.click(); log('Hero resursai perkelti į sandėlį'); setStatus('hero resursai perkelti'); }
          else setStatus('perkelti nėra ką (sandėlis pilnas?)');
        }
      }
      await sleep(rand(2000, 3000));
    }
    finishChore();
  }

  // Nuotykių puslapis: pirmas "advCheck" ar yra ką tyrinėti, paskui sveikata, paskui "advGo"
  const explorable = () => [...document.querySelectorAll('button')].filter(b =>
    b.offsetParent && !b.disabled && !/purple/.test(b.className) && !/video/i.test(b.textContent) && b.closest('table, [class*=adventure]'));

  // Kol herojus jau iškeliavęs į nuotykį, nuotykių puslapyje galima iš anksto peržiūrėti reklamas KITAM nuotykiui
  // (−25 % trukmė ir sunkesnis). Kartą per kiekvieną išvykimą. Reklamą žiūri tu – ekrano nuolat stebi žmogus.
  const ADV_ADS_AHEAD = true;
  function advAdsChore() {
    if (!ADV_ADS_AHEAD || !VIDEO_BOOST || !GM_getValue('videoBoost', true) || Date.now() < (GM_getValue('videoOffUntil', 0) || 0)) return false;
    if (heroAtHome()) { GM_setValue('advAdsDone', 0); return false; }
    if (GM_getValue('lastTrip', '') !== 'adv' || GM_getValue('advAdsDone', 0)) return false;
    if (Date.now() < (GM_getValue('advAdsNext', 0) || 0)) return false;
    GM_setValue('advAdsNext', Date.now() + rand(2, 4) * 60000);
    startChore('advAds', '/hero/adventures');
    return true;
  }
  async function watchAdvAds() {
    const rows = [...document.querySelectorAll('button')].filter(b => /Tyrinėti|Explore/i.test(b.textContent) && b.offsetParent).length;
    if (!rows) { setStatus('nuotykių reklamos: kito nuotykio nėra'); return finishChore(); }
    GM_setValue('advAdsDone', 1);                                  // kartą per išvykimą
    // Sunkumo reklama iš anksto NEspaudžiama: herojus nuotykyje dar praranda sveikatą, o sveikata tikrinama tik prieš siuntimą (onAdventures)
    const boxes = ['.videoFeatureBonusBox.adventureDuration'];
    for (const sel of boxes) {
      const box = document.querySelector(sel);
      const vb = box && [...box.querySelectorAll('button')].find(b => b.offsetParent && !b.disabled && !/disabled/.test(b.className));
      if (!vb) continue;
      const what = /Difficulty/.test(sel) ? 'kito nuotykio sunkumas' : 'kito nuotykio trukmė −25 %';
      log('Nuotykio reklama iš anksto:', what);
      setStatus('žiūrima reklama: ' + what);
      vb.click();
      await sleep(rand(...VIDEO_WAIT) * 1000);
      const vd = document.querySelector('.videoFeatureVideoDialog');
      if (vd && vd.offsetParent) {
        GM_setValue('videoOffUntil', Date.now() + 2 * 3600 * 1000);
        setStatus('reklamos langas neužsidarė – reklamos išjungtos 2 val.');
        return;                                                    // sargas po kelių min. grąžins į dorf1
      }
      await sleep(rand(1500, 3000));
    }
    setStatus('nuotykių reklamos peržiūrėtos');
    finishChore();
  }
  async function onAdventures() {
    const isCheck = chorePending('advCheck'), isGo = chorePending('advGo'), isAds = chorePending('advAds');
    if (!isCheck && !isGo && !isAds) return;
    GM_setValue('chore', '');
    await sleep(rand(2500, 4000));
    if (isAds) return watchAdvAds();
    const btns = explorable();
    if (!btns.length) { setStatus('nuotykių nėra'); return finishChore(); }
    if (isCheck) { startChore('heroHealth', '/hero/attributes'); return; }
    // Reklamos prieš siuntimą: trukmė −25 % ir (jei sveikata gera) sunkesnis nuotykis
    const hNow = GM_getValue('heroHealth', 0) || 0;
    const boxes = ['.videoFeatureBonusBox.adventureDuration'];
    if (ADV_HARD && hNow >= ADV_HARD_MIN_HEALTH) boxes.push('.videoFeatureBonusBox.adventureDifficulty');
    for (const sel of boxes) {
      if (!(VIDEO_BOOST && GM_getValue('videoBoost', true) && Date.now() >= (GM_getValue('videoOffUntil', 0) || 0))) break;
      const box = document.querySelector(sel);
      const vb = box && [...box.querySelectorAll('button')].find(b => b.offsetParent && !b.disabled && !/disabled/.test(b.className));
      if (vb) {
        vb.click();
        const what = /Difficulty/.test(sel) ? 'sunkesnis nuotykis' : 'nuotykio trukmė −25 %';
        log('Nuotykio reklama paleista:', what);
        setStatus('žiūrima reklama: ' + what);
        await sleep(rand(...VIDEO_WAIT) * 1000);
        const vd = document.querySelector('.videoFeatureVideoDialog');
        if (vd && vd.offsetParent) {
          GM_setValue('videoOffUntil', Date.now() + 2 * 3600 * 1000);
          setStatus('reklamos langas neužsidarė – nuotykio nesiunčiu, reklamos išjungtos 2 val.');
          return;                                   // sargas po kelių min. grąžins į dorf1
        }
        await sleep(rand(1500, 3000));
      }
    }
    const btns2 = explorable();
    if (!btns2.length) { setStatus('nuotykių nebėra'); return finishChore(); }
    btns2[0].click();
    GM_setValue('lastTrip', 'adv'); GM_setValue('oasisNext', 0);
    log('Hero siunčiamas į nuotykį');
    await sleep(rand(2000, 3000));
    const dlg = document.querySelector('.dialogContents button.green');     // jei prašo patvirtinimo
    if (dlg) { dlg.click(); await sleep(rand(1500, 2500)); }
    setStatus('hero išsiųstas į nuotykį');
    finishChore();
  }

  const heroInputVal = n => parseInt((document.querySelector(`input[name=${n}]`) || {}).value, 10) || 0;
  // „+" mygtukai eina ta pačia tvarka kaip laukai (strength, off, def, resursai)
  const heroPlus = n => {
    const idx = ['power', 'offBonus', 'defBonus', 'productionPoints'].indexOf(n);
    return document.querySelectorAll('.heroAttributes button.plus, .attributes button.plus')[idx] || null;
  };

  // Nepanaudotus taškus skirsto pagal taisyklę: bent HERO_STR_MIN į strength, kas HERO_STR_EVERY-as taškas į strength,
  // po per didelio nuotykio nuostolio kitas taškas į strength, visi kiti į resursus.
  async function allocatePoints() {
    const pts = parseInt((document.querySelector('.pointsAvailable') || {}).textContent, 10) || 0;
    if (pts <= 0) return;
    let str = heroInputVal('power'), off = heroInputVal('offBonus'), def = heroInputVal('defBonus'), res = heroInputVal('productionPoints');
    const startStr = str, startRes = res;
    let flag = !!GM_getValue('strFlag', 0);
    const plan = { power: 0, productionPoints: 0 };
    for (let i = 0; i < pts; i++) {
      const total = str + off + def + res + 1;
      let target = 'productionPoints';
      if (HERO_FIGHT) target = 'power';
      else if (str < HERO_STR_MIN) target = 'power';
      else if (flag) { target = 'power'; flag = false; }
      else if (total % HERO_STR_EVERY === 0) target = 'power';
      plan[target]++;
      if (target === 'power') str++; else res++;
    }
    for (const n of ['power', 'productionPoints']) {
      for (let k = 0; k < plan[n]; k++) {
        const btn = heroPlus(n);
        if (!btn || btn.disabled || btn.classList.contains('disabled')) break;
        btn.click();
        await sleep(rand(400, 1100));
      }
    }
    if (heroInputVal('power') !== startStr + plan.power || heroInputVal('productionPoints') !== startRes + plan.productionPoints) {
      setStatus('hero taškų „+" mygtukai nesuveikė – nesaugau, reikia pataisyti skriptą');
      return;
    }
    await sleep(rand(800, 1600));
    const save = [...document.querySelectorAll('button')].find(b => /save changes|įrašyti pakeitimus|speichern/i.test(b.textContent) && !b.classList.contains('disabled'));
    if (!save) { setStatus('hero taškų išsaugoti nepavyko (nėra „Save changes")'); return; }
    save.click();
    await sleep(rand(1500, 2500));
    const dlg = document.querySelector('.dialogContents button.green');
    if (dlg) { dlg.click(); await sleep(rand(1200, 2000)); }
    GM_setValue('strFlag', flag ? 1 : 0);
    log(`Hero taškai: strength +${plan.power}, resursai +${plan.productionPoints}`);
    setStatus(`hero taškai paskirstyti: strength +${plan.power}, resursai +${plan.productionPoints}`);
  }

  // Gamybos tipas: pasirenka trūkstamiausią žaliavą; jei nieko ypač netrūksta – grįžta į "all"
  async function switchProduction() {
    if (Date.now() < (GM_getValue('prodNext', 0) || 0)) return;
    const btns = [...document.querySelectorAll('button.pickProductionType')];
    if (!btns.length) return;
    const kindOf = b => /lumber_small/.test(b.innerHTML) ? 1 : /clay_small/.test(b.innerHTML) ? 2 : /iron_small/.test(b.innerHTML) ? 3 : /crop_small/.test(b.innerHTML) ? 4 : 0;
    const cur = btns.find(b => b.classList.contains('active'));
    const curKind = cur ? kindOf(cur) : null;
    const have = [1, 2, 3, 4].map(i => num(document.getElementById('l' + i)));
    const capEls = document.querySelectorAll('.capacity');
    const cw = num(capEls[0]), cg = num(capEls[1]);
    if (!cw || !cg) return;
    const ratio = have.map((h, i) => h / (i < 3 ? cw : cg));
    const order = ratio.map((r, i) => [r, i + 1]).sort((a, b) => a[0] - b[0]);
    const scarce = (order[0][0] < HERO_RES_SCARCE && order[1][0] - order[0][0] > 0.1) ? order[0][1] : 0;   // 0 = "all"
    if (scarce === curKind) return;
    const target = btns.find(b => kindOf(b) === scarce);
    if (!target || target.classList.contains('active')) return;
    target.click();
    await sleep(rand(1500, 2500));
    const dlg = document.querySelector('.dialogContents button.green');
    if (dlg) { dlg.click(); await sleep(rand(1200, 2000)); }
    GM_setValue('prodNext', Date.now() + HERO_RES_SWITCH_H * 3600 * 1000);
    const names = ['visi', 'mediena', 'molis', 'geležis', 'grūdai'];
    log(`Hero gamyba: ${names[curKind || 0]} → ${names[scarce]}`);
    setStatus(`hero gamyba: ${names[scarce]}`);
  }

  // Po oazės puolimo: grįžus herojui palyginti sveikatą prieš ir po (žaidimas nuostolio neparodo) – užrašoma mygtuke „Oazės“
  function noteOasisLoss(h) {
    const ob = jget('oasisBefore', null);
    if (!ob || !heroAtHome() || Date.now() - ob.ts < 3 * 60000) return;
    const loss = ob.h - h;
    const msg = `${ob.x}|${ob.y}: sveikata ${Math.round(ob.h)}→${Math.round(h)} % (nuostolis ${Math.round(loss)}, prognozė ${Math.round(ob.pred)}, k=${calK().toFixed(2)})`;
    GM_setValue('oasisNote', hhmm(Date.now()) + ' ' + msg);
    log('Oazės rezultatas:', msg);
    const hist = jget('oasisHist', []); hist.push({ t: Date.now(), x: ob.x, y: ob.y, before: ob.h, after: h, pred: ob.pred, raw: ob.raw || 0, ei: ob.ei || 0, total: ob.total || 0 }); jset('oasisHist', hist.slice(-60));
    jset('oasisBefore', null);
  }
  async function onAttributes() {
    const isHealth = chorePending('heroHealth'), isAttrs = chorePending('heroAttrs');
    if (!isHealth && !isAttrs) {
      // Tu pats atidarei herojaus atributus (pvz. paskirstai taškus) – skriptas tyliai perskaito naują jėgą ir sveikatą
      const passive = () => {
        try {
          readHeroAttack();
          const vals = [...document.querySelectorAll('.value')].map(e => e.textContent).filter(t => /%/.test(t));
          const h = vals.length ? parseFloat(vals[0].replace(/[^\d.]/g, '')) : null;
          if (h !== null && !isNaN(h)) { GM_setValue('heroHealth', h); GM_setValue('heroHealthTs', Date.now()); noteOasisLoss(h); }
        } catch (e) {}
      };
      setTimeout(passive, 2500); setInterval(passive, 8000);
      return;
    }
    GM_setValue('chore', '');
    await sleep(rand(2500, 4000));
    const vals = [...document.querySelectorAll('.value')].map(e => e.textContent).filter(t => /%/.test(t));
    const h = vals.length ? parseFloat(vals[0].replace(/[^\d.]/g, '')) : null;
    if (h !== null && !isNaN(h)) { GM_setValue('heroHealth', h); GM_setValue('heroHealthTs', Date.now()); noteOasisLoss(h); }
    // Ankstesnio nuotykio sveikatos nuostolis (apytikris: sveikata prieš išsiunčiant − dabar)
    const before = jget('advBefore', null);
    if (before && h !== null && Date.now() - before.ts > 25 * 60000) {
      if (Date.now() - before.ts < 8 * 3600000) {
        const loss = before.h - h;
        GM_setValue('strFlag', loss > HERO_LOSS_MAX ? 1 : 0);
        log(`Nuotykio sveikatos nuostolis ~${Math.round(loss)}%`);
      }
      jset('advBefore', null);
    }

    if (HERO_POINTS) await allocatePoints();
    readHeroAttack();                                   // jėga skaitoma PO taškų paskirstymo (kad neliktų senos reikšmės)
    if (HERO_AUTO_RES && GM_getValue('heroAutoRes', true)) await switchProduction();

    if (!isHealth) {
      if (Date.now() - (GM_getValue('oasisAfterAttr', 0) || 0) < 10 * 60000) {   // atėjome dėl oazės – iškart atgal į žemėlapį
        GM_setValue('oasisAfterAttr', 0);
        const v = vget('xy', null);
        if (v && heroAtHome()) { startChore('oasisScan', `/karte.php?x=${v.x}&y=${v.y}`); return; }
      }
      return finishChore();
    }
    if (h === null || isNaN(h)) { setStatus('hero sveikatos neperskaičiau – nuotykio nesiunčiu'); return finishChore(); }
    if (h < hc().advMin) { GM_setValue('advBadgeNext', Date.now() + rand(8, 15) * 60000); setStatus(`hero sveikata ${Math.round(h)}% – nesiunčiu`); return finishChore(); }
    jset('advBefore', { h, ts: Date.now() });
    startChore('advGo', '/hero/adventures');
  }

  // ---------- Oazės ----------
  const clean = t => String(t || '').replace(/[\u200e\u200f\u202a-\u202e]/g, '').replace(/\u2212/g, '-');
  function heroAtHome() {
    const e = [...document.querySelectorAll('.heroStatus .heroHome')].find(x => !x.classList.contains('hide'));
    return !!e;
  }
  function villageXY() {
    const e = document.querySelector('#sidebarBoxVillageList .listEntry.village.active .coordinatesGrid, #sidebarBoxVillageList .listEntry.active .coordinates');
    const t = clean(e ? e.textContent : '');
    const m = t.match(/(-?\d+)\s*\|\s*(-?\d+)/);
    if (m) { const v = { x: +m[1], y: +m[2] }; vset('xy', v); return v; }
    return vget('xy', null);
  }
  function readHeroAttack() {
    const box = document.querySelector('.heroAttributes');
    const m = box && clean(box.innerText).match(/(?:Fighting strength|Jėga)\D*([\d.,]+)/i);
    let a = m ? parseInt(m[1].replace(/[.,]/g, ''), 10) : 0;
    if (!a) a = 100 + 100 * (parseInt((document.querySelector('input[name=power]') || {}).value, 10) || 0);   // atsarginė formulė (patikrinta: 5 taškai = 600)
    if (a) {
      const old = GM_getValue('heroAttack', 0) || 0;
      GM_setValue('heroAttack', a);
      if (!old || Math.abs(a - old) / old >= 0.15) { GM_setValue('oasisCache', '{}'); GM_setValue('oasisNext', 0); }   // jėga pasikeitė – seni „per stipri“ sprendimai negalioja
    }
  }
  // SAVIKALIBRACIJA: faktinis sveikatos nuostolis (prieš/po) / žaidimo formulės prognozė – mediana iš paskutinių oazių rezultatų.
  // Formulė (D/A)^1.5 – apytikslė, todėl prognozė dauginama iš šio koeficiento (0.5–3); kol rezultatų <3 – 1.3 (atsarga)
  function calK() {
    const r = jget('oasisHist', []).filter(h => h.raw >= 3 && h.before != null && h.after != null).slice(-12)
      .map(h => Math.max(0, h.before - h.after) / h.raw).sort((a, b) => a - b);
    if (r.length < 3) return 1.3;
    const med = r.length % 2 ? r[(r.length - 1) / 2] : (r[r.length / 2 - 1] + r[r.length / 2]) / 2;
    return Math.min(3, Math.max(0.5, med * 1.1));                         // +10 % atsarga
  }
  // Kovos prognozė: x = (D/A)^1.5; puolimas: herojus netenka ~100·x sveikatos, plėšimas: ~100·x/(1+x)
  function predictLoss(defense, attack, raid) {
    if (!attack) return 999;
    if (defense <= 0) return 0;
    const x = Math.pow(defense / attack, 1.5);
    if (x >= 1 && !raid) return 999;                // puolime pralaimėjus herojus žūtų; plėšime – tik didelis nuostolis
    return 100 * (raid ? x / (1 + x) : x);
  }
  async function api(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('api ' + r.status);
    return r.json();
  }
  async function tileAnimals(x, y) {
    const j = await api('/api/v1/map/tile-details', { x, y });
    const d = document.createElement('div');
    d.innerHTML = (j && j.html) || '';
    const title = clean((d.querySelector('h1') || {}).textContent || '');
    const ti = d.querySelector('#troop_info');
    const res = { free: /unoccupied|unbesetzt|laisva/i.test(title), animals: [], total: 0 };
    if (ti) for (const tr of ti.querySelectorAll('tr')) {
      const img = tr.querySelector('[class*="u3"], [class*="u40"]');
      const um = img && String(img.className).match(/\bu(3\d|40)\b/);
      const n = parseInt(clean((tr.querySelector('td:nth-child(2), .val') || {}).textContent || '').replace(/\D/g, ''), 10) || 0;
      if (um && n) { res.animals.push({ u: 'u' + um[1], n }); res.total += n; }
    }
    return res;
  }
  const oasisSay = msg => { GM_setValue('oasisNote', hhmm(Date.now()) + ' ' + msg.replace(/^oazės:\s*/, '')); setStatus(msg); };
  async function onMap() {
    if (!chorePending('oasisScan')) return;
    GM_setValue('chore', '');
    const mode = GM_getValue('oasisMode', 'on');
    await sleep(rand(3000, 7000));
    const v = villageXY() || vget('xy', null);
    const health = GM_getValue('heroHealth', 0), attack = GM_getValue('heroAttack', 0);
    if (!v) { oasisSay('oazės: nežinau kaimo koordinačių'); return finishChore(); }
    if (!attack || Date.now() - (GM_getValue('heroHealthTs', 0) || 0) > HEALTH_FRESH_MIN * 60000) {
      oasisSay('oazės: pirma pažiūrėsiu hero sveikatą');
      GM_setValue('oasisAfterAttr', Date.now());
      startChore('heroAttrs', '/hero/attributes');
      return;
    }
    if (GM_getValue('cagesDirty', 0)) { oasisSay('pažiūrėsiu, kiek narvų turiu'); startChore('cageCheck', '/hero/inventory'); return; }
    if (health < OINTMENT_BELOW && (GM_getValue('ointBag', 0) || 0) > 0 && mode === 'on') {
      oasisSay(`oazės: sveikata ${Math.round(health)}% – naudosiu tepalą`);
      startChore('ointUse', '/hero/inventory');
      return;
    }
    if (health < hc().oasisMin && !(GM_getValue('cagesOn', false))) { GM_setValue('oasisNoneTs', Date.now()); oasisSay(`oazės: hero sveikata ${Math.round(health)}% – ilsisi`); return finishChore(); }
    try {
      // Paieškos centras: pirmiausia aplink kaimą; jei nieko – pamažu toliau (atsitiktinė kryptis)
      const ring = GM_getValue('oasisRing', 0) || 0;     // rodyklė į langų sąrašą (0 = pradžia, nuo kaimo)
      // Visi žemėlapio langai (~9×11 laukelių) iki OASIS_MAX_DIST, surikiuoti nuo artimiausio; kas skenavimą – kiti OASIS_WINDOWS_PER_SCAN langai
      const allWin = [];
      for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) { const dx = i * 8, dy = j * 9; if (Math.hypot(dx, dy) <= OASIS_MAX_DIST) allWin.push([v.x + dx, v.y + dy, Math.hypot(dx, dy)]); }
      allWin.sort((a, b) => a[2] - b[2]);
      const startW = ring >= allWin.length ? 0 : ring;
      const centers = allWin.slice(startW, startW + OASIS_WINDOWS_PER_SCAN).map(w => [w[0], w[1]]);
      const nextRing = startW + OASIS_WINDOWS_PER_SCAN;
      const seenT = new Set(), allTiles = [];
      for (const [px, py] of centers) {
        try {
          const pp = await api('/api/v1/map/position', { data: { x: px, y: py, zoomLevel: 1, ignorePositions: [] } });
          for (const t of (pp.tiles || [])) { const k = t.position.x + '|' + t.position.y; if (!seenT.has(k)) { seenT.add(k); allTiles.push(t); } }
        } catch (e) {}
        await sleep(rand(300, 900));
      }
      const pos = { tiles: allTiles };
      const cache = jget('oasisCache', {});
      const now = Date.now();
      const cands = (pos.tiles || []).filter(t => /\{k\.fo\}/.test(t.title || '')).map(t => {
        const has = /\{k\.animals\}/.test(String(t.text || ''));            // žemėlapis pažymi, ar oazėje yra gyvūnų
        const dist = Math.hypot(t.position.x - v.x, t.position.y - v.y);
        return { x: t.position.x, y: t.position.y, has, dist };
      }).filter(c => c.has && c.dist <= OASIS_MAX_DIST && !(cache[c.x + '|' + c.y] > now))
        .sort((a, b) => a.dist - b.dist).slice(0, OASIS_DETAILS_PER_SCAN);
      let best = null, bestCage = null;
      const cagesOn = GM_getValue('cagesOn', false);
      const eqC = GM_getValue('cagesEq', 0) || 0, avail = (GM_getValue('cagesBag', 0) || 0) + eqC;
      if (cagesOn && avail === 0) log('Narvai įjungti, bet narvų skaičius 0 – narvų taikinių nerinksiu');
      for (const c of cands) {
        await sleep(rand(1500, 4500));
        const info = await tileAnimals(c.x, c.y);
        if (!info.free) { cache[c.x + '|' + c.y] = now + 12 * 3600000; continue; }    // užimta kito žaidėjo – nelieti
        if (info.total === 0) { const eo = jget('emptyOases', []).filter(o => !(o.x === c.x && o.y === c.y)); eo.push({ x: c.x, y: c.y }); jset('emptyOases', eo.slice(-15)); cache[c.x + '|' + c.y] = now + rand(60, 120) * 60000; log(`Oazė ${c.x}|${c.y}: tuščia – nieko neduotų, praleidžiu`); continue; }   // tuščia oazė nieko neduoda (patikrinta)
        let def = 10, xp = 0, dI = 0, dC = 0;
        for (const a of info.animals) { const st = ANIMALS[a.u]; if (!st) { def = Infinity; break; } def += a.n * Math.max(st.d[0], st.d[1]); dI += a.n * st.d[0]; dC += a.n * st.d[1]; xp += a.n * st.up; }
        // Gynyba pagal puolėjų sudėtį (kaip žaidimas): pėstininkų puolimo dalis × gynyba nuo pėstininkų + raitelių dalis × gynyba nuo raitelių.
        // Herojus su žirgu – raitelis (simuliatorius: herojus + 25 EI prieš 17 žiurkių, 11 vorų, 6 šernus → gynyba 988 = gynyba nuo raitelių)
        const defFor = (ai, ac) => !isFinite(def) ? Infinity : (10 + (dI * ai + dC * ac) / Math.max(1, ai + ac)) * OASIS_SAFETY;
        // Narvų taikinys: oazėje TIK stiprūs gyvūnai – sugaunami be kovos
        const weakN = info.animals.filter(a => !CAGE_ANIMALS.includes(a.u)).reduce((p, a) => p + a.n, 0);
        if (cagesOn && avail > 0 && info.animals.length && weakN <= CAGE_WEAK_MAX) {
          // gaudoma nuo silpniausių: surikiuojam pagal rūšies numerį ir imame pirmus `need`
          const order = info.animals.slice().sort((p, q) => parseInt(p.u.slice(1), 10) - parseInt(q.u.slice(1), 10));
          const need = Math.min(info.total, avail);
          const caught = []; for (const a of order) for (let k = 0; k < a.n && caught.length < need; k++) caught.push(a.u);
          const strongCaught = caught.filter(u => CAGE_ANIMALS.includes(u)).length;
          if (strongCaught >= Math.min(CAGE_MIN_STRONG, info.total - weakN) && strongCaught > 0) {
            const cval = caught.reduce((p, u) => p + Math.max(...ANIMALS[u].d), 0) / (1 + c.dist / 10);
            const desc = info.animals.map(a => ANIMALS[a.u].n + '×' + a.n).join(', ');
            log(`Oazė ${c.x}|${c.y}: tinka narvams (${desc}), narvų ${need}, stiprių sugautų ${strongCaught}`);
            GM_setValue('oasisNote', hhmm(Date.now()) + ` narvams tinka ${c.x}|${c.y} (${desc})`);
            if (!bestCage || cval > bestCage.cval) bestCage = { x: c.x, y: c.y, need, cval, desc };
            if (weakN === 0) continue;                                   // vien stiprūs – plėšti vis tiek neapsimoka
          }
        }
        def *= OASIS_SAFETY;
        const raid = info.total === 0;
        // Su herojumi gali eiti Imperatoriaus raiteliai: visa jėga didesnė → mažesni nuostoliai ir herojui, ir jiems.
        // Nuostolio % taikomas kiekvienam kariui: žuvusių EI ≈ n × nuostolis. Perrenkami visi n – imamas DIDŽIAUSIAS n, kai nežūsta nė vienas
        // (daugiau grobio, mažiau žalos herojui); jei taip neišeina, o vienas herojus netinka – leidžiama žūti ne daugiau kaip OASIS_EI_MAX_DEATHS.
        const eiAvail = Math.min(GM_getValue('eiHome', 0) || 0, OASIS_EI_MAX);
        const hA = HERO_MOUNTED ? [0, attack] : [attack, 0];                 // herojaus puolimas: [pėstininkų, raitelių]
        const dEI = n => defFor(hA[0], hA[1] + n * EI_ATTACK);                // herojus + n EI
        const rawFor = n => predictLoss(dEI(n), attack + n * EI_ATTACK, true);
        // Savikalibracija mažina prognozę tik lengvose kovose (x < 0,5): ji skaičiuota iš lengvų kovų, sunkioms netinka (18:30 žuvo herojus)
        const xFor = n => Math.pow(dEI(n) / (attack + n * EI_ATTACK), 1.5);
        const lossFor = n => Math.min(999, rawFor(n) * (xFor(n) >= 0.5 ? Math.max(1, calK()) : calK()));
        const deathsFor = n => Math.round(n * lossFor(n) / 100);
        // Kai gyvūnų gynyba (be atsargos) ≥ mūsų puolimo – plėšimą pralaimim: herojus netenka ~60 %+ sveikatos, EI žūsta – niekada nesiunčiam
        const winsFor = n => dEI(n) / OASIS_SAFETY < attack + n * EI_ATTACK;
        const okFor = n => { const l = lossFor(n); return winsFor(n) && health >= hc().oasisMin && l <= hc().oasisMaxLoss && health - l >= hc().oasisKeep; };
        // Kiek EI siųsti: didžiausia NAUDA = premija už nukautus gyvūnus − žuvę EI − herojaus sveikata (1 % = hc().hpValue resursų).
        // Herojaus sveikata – riboto greičio išteklius: geriau prarasti 1 EI ir saugoti herojų (pvz. 25 EI: −1 EI, herojui −3 %; 5 EI: 0 EI, herojui −9 %)
        const valFor = n => OASIS_BONUS_PER_UP * xp / (1 + xFor(n)) - deathsFor(n) * UNIT_COST_R.t5 - lossFor(n) * hc().hpValue;
        let nEI = 0, bestV = -Infinity;
        for (let n = 0; n <= eiAvail; n++) if (okFor(n) && deathsFor(n) <= OASIS_EI_MAX_DEATHS) { const v = valFor(n); if (v > bestV) { bestV = v; nEI = n; } }
        let loss = lossFor(nEI);      // laisvą oazę žaidimas leidžia tik plėšti (patikrinta)
        let ok = okFor(nEI), army = null;
        // ARMIJA: herojus + visi EI + imperionai + legionieriai (artimoms oazėms) – mažesnis nuostolis kiekvienam, daugiau nukautų (XP, premija)
        if (OASIS_ARMY) {
          const ih = jget('infHome', {}) || {};
          const units = { t5: eiAvail, t3: c.dist * 60 / (7 * TROOP_SPEED) <= ARMY_MAX_MIN ? (ih.t3 || 0) : 0, t1: c.dist * 60 / (6 * TROOP_SPEED) <= ARMY_MAX_MIN ? (ih.t1 || 0) : 0 };   // lėti pėstininkai – tik iki ARMY_MAX_MIN kelio
          if (units.t3 + units.t1 > 0) {
            const att = attack + Object.entries(units).reduce((a2, [u, n]) => a2 + n * UNIT_ATT_R[u], 0);
            const defA = defFor(hA[0] + units.t1 * UNIT_ATT_R.t1 + units.t3 * UNIT_ATT_R.t3, hA[1] + units.t5 * UNIT_ATT_R.t5);   // pėstininkų ir raitelių dalys
            const xA = Math.pow(defA / att, 1.5);
            const lossA = Math.min(999, predictLoss(defA, att, true) * (xA >= 0.5 ? Math.max(1, calK()) : calK()));
            const deaths = Object.fromEntries(Object.entries(units).map(([u, n]) => [u, Math.round(n * lossA / 100)]));
            const lostRes = Object.entries(deaths).reduce((a2, [u, d2]) => a2 + d2 * UNIT_COST_R[u], 0);
            const xp0 = Math.pow((defA / OASIS_SAFETY) / att, 1.5), killedA = 1 / (1 + xp0);
            const bonus = OASIS_BONUS_PER_UP * xp * killedA, profit = bonus - lostRes;
            const okA = defA / OASIS_SAFETY < att && health >= hc().oasisMin && lossA <= hc().oasisMaxLoss && health - lossA >= hc().oasisKeep && profit >= 0;
            log(`Oazė ${c.x}|${c.y}: ARMIJA (EI ${units.t5}, imperionų ${units.t3}, legionierių ${units.t1}) – herojui −${Math.round(lossA)} sv., žus ${JSON.stringify(deaths)} (${lostRes} res.), premija ~${Math.round(bonus)} → ${okA ? 'TINKA' : 'netinka'}`);
            const valA = bonus - lostRes - lossA * hc().hpValue;                 // ta pati nauda kaip EI variantui
            if (okA && (!ok || valA > valFor(nEI))) { army = { units, deaths, lostRes, bonus, raw: predictLoss(defA, att, true) }; loss = lossA; ok = true; nEI = units.t5; }
          }
        }
        const xr = Math.pow(dEI(nEI) / (attack + nEI * EI_ATTACK), 1.5);
        const killed = 1 / (1 + xr);                                       // plėšime nukaunama dalis gyvūnų
        const score = xp * killed / (1 + c.dist / 8);                       // XP ir grobis ~ nukautų gyvūnų išlaikymui; tolimesnės – mažiau vertos
        log(`Oazė ${c.x}|${c.y}: gyvūnų ${info.total}, gynyba ~${Math.round(dEI(nEI))}, ${nEI ? `+${nEI} EI (žus ~${deathsFor(nEI)}), ` : ''}prognozė −${loss > 100 ? '∞' : Math.round(loss)} sv. ${ok ? 'TINKA' : 'netinka'}`);
        if (!ok) { cache[c.x + '|' + c.y] = now + (loss > hc().oasisMaxLoss ? rand(25, 50) : rand(15, 30)) * 60000; continue; }
        if (xp < OASIS_MIN_XP) { log(`Oazė ${c.x}|${c.y}: per menka (vertė ${xp}) – praleidžiu`); cache[c.x + '|' + c.y] = now + rand(60, 120) * 60000; continue; }   // per stipri – ilgiau; tik sveikatos trūksta – trumpiau
        if (!best || score > best.score) best = { ...c, raid, loss, score, total: info.total, ei: nEI, eiDead: army ? army.deaths.t5 : nEI ? deathsFor(nEI) : 0, raw: army ? army.raw : rawFor(nEI), inf: army ? { t3: army.units.t3, t1: army.units.t1 } : null, army };
      }
      jset('oasisCache', cache);
      if (bestCage && heroAtHome()) {
        if (mode !== 'on') { oasisSay(`BANDYMAS: narvai ${bestCage.need} → ${bestCage.x}|${bestCage.y} (${bestCage.desc})`); return later(rand(20, 40), () => finishChore()); }
        cache[bestCage.x + '|' + bestCage.y] = now + rand(60, 120) * 60000;
        jset('oasisCache', cache);
        jset('oasisTarget', { x: bestCage.x, y: bestCage.y, raid: true, loss: 0, cage: bestCage.need });
        if (bestCage.need > eqC) { oasisSay(`narvai: uždedu ${bestCage.need - eqC} ir gaudysiu ${bestCage.desc} ${bestCage.x}|${bestCage.y}`); startChore('cageEquip', '/hero/inventory'); }
        else { oasisSay(`narvai: gaudysiu ${bestCage.desc} ${bestCage.x}|${bestCage.y}`); GM_setValue('cagesDirty', 1); startChore('oasisSend', `/build.php?id=39&gid=16&tt=2&x=${bestCage.x}&y=${bestCage.y}`); }
        return;
      }
      if (eqC > 0) { GM_setValue('oasisNoneTs', Date.now()); oasisSay(`uždėta narvų: ${eqC} – paprastų plėšimų nedarau (sugautų silpnus gyvūnus), laukiu tinkamos oazės`); return finishChore(); }
      if (!best) {
        const cycleDone = nextRing >= allWin.length;
        GM_setValue('oasisRing', cycleDone ? 0 : nextRing);
        GM_setValue('oasisNoneTs', Date.now());
        GM_setValue('advNext', 0); GM_setValue('advBadgeNext', 0);      // oazių nėra – herojus iškart tikrina nuotykius
        if (!cycleDone) GM_setValue('oasisNext', Date.now() + rand(...OASIS_NEXT_WIN) * 60000);   // tęsti toliau netrukus
        else GM_setValue('oasisNext', Date.now() + rand(...OASIS_EMPTY_WAIT) * 60000);          // visa zona tuščia – gyvūnai atsiras negreit
        const far = Math.round(allWin[Math.min(nextRing, allWin.length) - 1][2]);
        oasisSay(cycleDone ? `oazės: visa zona iki ${OASIS_MAX_DIST} laukelių peržiūrėta – tinkamų nėra, pradėsiu iš naujo` : `oazės: iki ~${far} laukelių tinkamų nėra – netrukus žiūriu toliau`);
        return finishChore();
      }
      GM_setValue('oasisRing', 0);
      const what = best.raid ? 'plėšti (tuščia)' : `pulti (${best.total} gyv.)`;
      const protectedNow = /beginner.?s protection|naujoko apsaug/i.test(document.body.innerText);
      if (mode !== 'on' || (OASIS_RESPECT_PROTECTION && protectedNow)) {
        oasisSay(`BANDYMAS: būtų ${what} ${best.x}|${best.y}, nuostolis ~${Math.round(best.loss)} sv.` + (mode === 'on' ? ' (dar apsauga)' : ''));
        log('Oazių BANDYMAS – nesiunčiu:', best);
        return later(rand(20, 40), () => finishChore());
      }
      cache[best.x + '|' + best.y] = now + rand(90, 180) * 60000;
      jset('oasisCache', cache);
      jset('oasisTarget', { x: best.x, y: best.y, raid: best.raid, loss: best.loss, raw: best.raw || 0, ei: best.ei || 0, inf: best.inf || null, total: best.total || 0 });
      GM_setValue('heroHealth', Math.max(0, health - best.loss));     // kol neperskaityta iš naujo – skaičiuojam su numatomu nuostoliu
      oasisSay(`oazės: ${what} ${best.x}|${best.y}` + (best.army ? ` su ARMIJA (EI ${best.army.units.t5}, imper. ${best.army.units.t3}, legion. ${best.army.units.t1}; žus ~${best.army.lostRes} res., premija ~${Math.round(best.army.bonus)})` : best.ei ? ` su ${best.ei} EI (žus ~${best.eiDead})` : '') + `, nuostolis ~${Math.round(best.loss)} sv.`);
      startChore('oasisSend', `/build.php?id=39&gid=16&tt=2&x=${best.x}&y=${best.y}`);
    } catch (e) {
      log('Oazių klaida:', e && e.message);
      oasisSay('oazės: klaida skaitant žemėlapį – praleidžiu');
      finishChore();
    }
  }
  // Susibūrimo vieta: užpildyti herojų, pasirinkti puolimą/plėšimą, patvirtinti
  async function onRally() {
    const setV = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    if (chorePending('oasisSend')) {
      GM_setValue('chore', '');
      await sleep(rand(2500, 6000));
      const t = jget('oasisTarget', null);
      const hero = document.querySelector('input[name="troop[t11]"]');
      const radio = [3, 4].map(v => document.querySelector(`input[name=eventType][value="${v}"]`)).find(r => r && !r.disabled);
      const ok = document.querySelector('form button[name=ok], form button[type=submit]');
      if (!t || !hero || !radio || !ok || hero.disabled) { setStatus('oazės: siuntimo forma kitokia – nesiunčiu'); return finishChore(); }
      setV(hero, '1');
      await sleep(rand(600, 1500));
      if (t.ei > 0) {
        const eiIn = document.querySelector('input[name="troop[t5]"]');
        if (!eiIn || eiIn.disabled) { setStatus('oazės: EI namie nebėra – perskaičiuosiu'); GM_setValue('oasisNext', 0); return finishChore(); }
        setV(eiIn, String(t.ei));
        await sleep(rand(500, 1200));
      }
      if (t.inf) for (const u of ['t3', 't1']) {                          // armija: pėstininkai (tiek, kiek tikrai namie)
        const n = t.inf[u] || 0; if (!n) continue;
        const inp = document.querySelector(`input[name="troop[${u}]"]`); if (!inp || inp.disabled) continue;
        const avail = parseInt(clean((inp.closest('td') || inp.parentElement).textContent).replace(/[^\d]/g, ''), 10) || 0;
        if (avail) { setV(inp, String(Math.min(n, avail))); await sleep(rand(400, 1000)); }
      }
      radio.click();
      await sleep(rand(700, 1800));
      GM_setValue('chore', 'oasisConfirm'); GM_setValue('choreTs', Date.now()); GM_setValue('navTs', Date.now());
      ok.click();
      return;
    }
    if (chorePending('oasisDone')) {
      GM_setValue('chore', '');
      await sleep(rand(1500, 3000));
      const t = jget('oasisTarget', null);
      const away = [...document.querySelectorAll('.heroStatus .heroHome')].every(x => x.classList.contains('hide'));
      if (away) { log('Hero išsiųstas į oazę', t); GM_setValue('oasisNote', hhmm(Date.now()) + ` išsiųstas ${t ? t.x + '|' + t.y : ''}`); setStatus(`hero išsiųstas į oazę ${t ? t.x + '|' + t.y : ''}`); }
      else { setStatus('oazės: siuntimas nepavyko (hero namie) – oazės sustabdytos 2 val.'); GM_setValue('oasisNext', Date.now() + 2 * 3600 * 1000); }
      return finishChore();
    }
    if (chorePending('oasisConfirm')) {
      GM_setValue('chore', '');
      await sleep(rand(2500, 5000));
      // Patvirtinimo puslapyje yra „Edit“, „Wave Builder“ ir „Confirm“ – spausti tik „Confirm“
      const vis = [...document.querySelectorAll('form button, button')].filter(b => b.offsetParent && !b.disabled);
      let btn = vis.find(b => /^\s*(confirm|bestätigen|patvirtinti)\s*$/i.test(b.textContent));
      if (!btn) {
        const cand = vis.filter(b => /green/.test(b.className) && !/edit|wave|back|cancel|atgal|zurück|bearbeiten|redaguoti|keisti|taisyti|bang|builder/i.test(b.textContent));
        if (cand.length === 1) btn = cand[0];                                  // lietuviškas tekstas neįvardytas – imame tik jei vienas tinkamas žalias mygtukas
        else { log('Patvirtinimo mygtukai:', vis.map(b => clean(b.textContent).trim() + '|' + String(b.className).slice(0, 25)).join(' ; ')); }
      }
      if (!btn) { setStatus('oazės: patvirtinimo mygtuko nerasta – nesiunčiu'); return finishChore(); }
      GM_setValue('chore', 'oasisDone'); GM_setValue('choreTs', Date.now()); GM_setValue('navTs', Date.now());
      GM_setValue('lastTrip', 'oasis');
      { const tt = jget('oasisTarget', null); if (tt) jset('oasisBefore', { x: tt.x, y: tt.y, h: GM_getValue('heroHealth', 0) || 0, pred: tt.loss || 0, raw: tt.raw || 0, ei: tt.ei || 0, total: tt.total || 0, ts: Date.now() }); }
      btn.click();
      const t = jget('oasisTarget', null);
      await sleep(rand(4000, 6000));                // jei puslapis persikrovė – šis kodas nebevykdomas, tęsia 'oasisDone'
      GM_setValue('chore', '');
      if (![...document.querySelectorAll('.heroStatus .heroHome')].every(x => x.classList.contains('hide'))) {
        log('Hero vis dar namie – siuntimas nepavyko');
        setStatus('oazės: siuntimas nepavyko (hero namie) – oazės sustabdytos 2 val.');
        GM_setValue('oasisNext', Date.now() + 2 * 3600 * 1000);
        return finishChore();
      }
      log('Hero išsiųstas į oazę', t);
      setStatus(`hero išsiųstas į oazę ${t ? t.x + '|' + t.y : ''}`);
      await sleep(rand(2000, 3500));
      return finishChore();
    }
  }

  function onHero() {
    const p = location.pathname;
    if (p.includes('inventory')) {
      if (chorePending('cageEquip')) return onCageEquip();
      if (chorePending('cageCheck')) return onCageCheck();
      if (chorePending('ointUse')) return onOintUse();
      later(3, readCages);
      return onInventory();
    }
    if (p.includes('attributes')) return onAttributes();
    if (p.includes('adventure')) return onAdventures();
  }

  async function onDorf1() {
    noteHeroHome();
    try { if (await attackGoto()) return; } catch (e) {}
    try { if (await returnHelpCheck()) return; } catch (e) {}
    if (dumpCheck()) return;
    if (await dodgeCheck()) return;
    if (inPause()) { setStatus('nakties pauzė (sargyba nuo puolimų veikia)'); pauseWatch(); return later(pauseWakeSec(), () => (location.href = '/dorf1.php')); }
    if (breakCheck()) return;
    try { postSupplyNeed(); } catch (e) {}                             // pažymėti trūkumą anksti – dar prieš šalutinius darbus
    if (Date.now() - ((jget('troopCnts', {})[DID] || {}).ts || 0) > 15 * 60000) ownedTroops();   // karių suvestinei (fone, be naršymo)
    // KARO REŽIMAS: statybų nėra – tik kariai, reidai, turgus ir t. t. IŠIMTIS: grūdų balansas žemas/neigiamas – keliami TIK grūdų laukai (kad kariai nebadautų)
    const fcW = (() => { const e = document.getElementById('stockBarFreeCrop'); const v = e ? parseInt(clean(e.textContent).replace(/[^\d-]/g, ''), 10) : NaN; return isNaN(v) ? null : v; })();
    const cropOnly = !GM_getValue('buildOn', true) && fcW !== null && fcW < WAR_CROP_MIN;
    if (!GM_getValue('buildOn', true) && !cropOnly && !myOrders().length) {
      vset('bIdleTs', Date.now());                                         // statybų nėra – sandėlio perteklius gali keliauti turgumi
      if (maybeChores()) return;
      setStatus('statybos išjungtos (karo režimas) – laukiu darbų');
      return scheduleNext(rand(3, 6));
    }
    planRound();
    // Jei sandėlis beveik pilnas ir eilėje yra vietos – pirma statyti, šalutiniai darbai palauks
    const capE = document.querySelectorAll('.capacity');
    const cW = num(capE[0]), cG = num(capE[1]);
    const stock = [1, 2, 3, 4].map(i => num(document.getElementById('l' + i)));
    const nearFull = cW && cG && stock.some((h, i) => h >= (i < 3 ? cW : cG) * STORAGE_LIMIT);
    // Statybos pirmiau už šalutinius darbus; kartais (25 %) žmogus pirma pasižiūri kitur – bet ne kai sandėlis pilnas
    if (jget('aucTarget', null) && maybeChores()) return;                 // aukcionas baigiasi – nelaukti atsitiktinumo
    if (!nearFull && !wakeActive() && Math.random() < 0.25 && maybeChores()) return;

    const qLen = document.querySelectorAll('.buildingList ul li').length;
    if (qLen >= (ROMAN ? 3 : 1)) {
      vset('bIdleTs', Date.now());                                         // eilė pilna – dabar statyti nėra ką
      const m = minTimer();
      if (maybeChores()) return;
      setStatus('eilė pilna, laukiama');
      return scheduleNext(isFinite(m) ? m + rand(1, 5) : rand(...RETRY));
    }

    // Taupymas įsikūrėjams: laukai keliami VISADA (tai nuolatinis augimas); stabdoma tik pastatų eilė ir karių treniravimas
    const saving = settlerSaving() && !nearFull;

    let builds;
    try {
      const r = await fetch('/dorf2.php', { credentials: 'same-origin' });
      builds = readBuildings(new DOMParser().parseFromString(await r.text(), 'text/html'));
    } catch (e) { setStatus('klaida skaitant centrą'); return scheduleNext(rand(...RETRY)); }
    if (!builds.length) { setStatus('NEPAVYKO perskaityti pastatų (dorf2) – reikia pataisyti skriptą'); return; }
    try { recordProgress(builds, readFields(document)); } catch (e) {}
    { const lv = {}; for (const b of builds) if (b.gid) lv[b.gid] = Math.max(lv[b.gid] || 0, b.lvl); vset('blv', lv); }

    const fields = readFields(document);
    vset('bldList', builds.map(b => ({ slot: b.slot, gid: b.gid, lvl: b.lvl, uc: b.uc }))); vset('fldList', fields.map(f => ({ slot: +f.slot, gid: f.gid, lvl: f.lvl, uc: f.uc })));   // užsakymų langui
    if (!fields.length) { setStatus('NEPAVYKO perskaityti laukų – reikia pataisyti skriptą'); return; }

    const have = [1, 2, 3, 4].map(i => num(document.getElementById('l' + i)));
    const capEls = document.querySelectorAll('.capacity');
    const caps = { w: num(capEls[0]), g: num(capEls[1]) };
    if (!caps.w || !caps.g) { setStatus('NEPAVYKO perskaityti sandėlio talpos – reikia pataisyti skriptą'); return; }

    const free = ROMAN
      ? { field: !fields.some(f => f.uc), building: !builds.some(b => b.uc) }
      : { field: true, building: true };
    const blockedB = Date.now() < (vget('blockedUntil', 0) || 0);
    if (saving) free.building = false;

    const d = decide(fields, builds, have, caps, free, blockedB);
    if (!GM_getValue('buildOn', true) && !cropOnly) { d.building = null; d.field = null; }   // karo režimas: tik užsakymai
    { const oa = orderAction(fields, builds, free); if (oa.demolish) return; if (oa.field) d.field = oa.field; if (oa.building) d.building = oa.building; if (oa.field || oa.building) d.ordered = true; }
    { const tres = trainReserve();                                          // rezervas kariams – statybos jo neliečia
      if (tres.some(v => v >= 1)) for (const lane of ['field', 'building']) {
        const a = d[lane]; if (!a) continue;
        const cur = lane === 'field' ? fields.find(f => +f.slot === +a.slot) : builds.find(b => +b.slot === +a.slot);
        const cost = bCost(a.gid, a.kind === 'new' || !cur ? 1 : cur.lvl + (cur.uc ? 1 : 0) + 1);
        if (cost && cost.some((c, i) => have[i] - tres[i] < c)) { d[lane] = null; d.resWait = `${a.desc} – laukia, rezervas kariams ${tres.join('/')}`; }
      } }
    if (cropOnly && !d.ordered) {                                          // karo režimas + mažai grūdų: tik žemiausias grūdų laukas
      d.building = null;
      if (!(d.field && d.field.gid === 4)) {
        const cf = fields.filter(f => f.gid === 4 && !f.uc && !isSkipped('f' + f.slot)).sort((a, b) => a.lvl - b.lvl)[0];
        d.field = cf && free.field ? { lane: 'field', kind: 'upgrade', slot: cf.slot, gid: 4, key: 'f' + cf.slot, desc: `grūdų laukas #${cf.slot} → ${cf.lvl + 1} (karo režimas, laisvi grūdai ${fcW})` } : null;
      }
      if (!d.field) { if (maybeChores()) return; setStatus(`karo režimas: grūdų mažai (${fcW}/val.), bet grūdų lauko kelti dabar negalima`); return scheduleNext(rand(3, 6)); }
    }
    // 60 % taisyklė: sandėlis ≥60 % – pirma pastatas mieste, mažiau – pirma laukas (15 % atvejų atvirkščiai – žmogiška įvairovė)
    const whFill = Math.max(have[0], have[1], have[2]) / (caps.w || 1);
    const bFirst = (whFill >= LANE_SPLIT) !== (Math.random() < 0.15);
    const a = (d.building && d.field) ? (bFirst ? d.building : d.field) : (d.building || d.field);
    if (!a) {
      vset('bIdleTs', Date.now());                                         // šiuo metu nieko nestato
      if (!d.complete) GM_setValue('starvedTs', Date.now());   // nėra ką statyti (trūksta resursų) – herojus dirba resursams
      if (maybeChores()) return;
      if (wakeActive() && wakeFinish()) return;                         // nakties serija: viskas padaryta → miegoti
      if (d.complete) setStatus('planas įvykdytas');
      else setStatus((saving ? `taupau įsikūrėjams (${stGet().have || 0}/3), laukai – toliau; ` : '') + (d.resWait ? d.resWait : d.desc ? 'kitas: ' + d.desc : 'nėra ką daryti dabar'));
      const m = minTimer();
      return scheduleNext(d.complete ? 1800 : (qLen && isFinite(m) ? Math.min(m + rand(1, 5), rand(...RETRY)) : rand(...RETRY)));
    }

    setStatus('kitas: ' + a.desc);
    GM_setValue('pending', JSON.stringify({ ...a, did: DID, ts: Date.now() }));
    const url = `/build.php?id=${a.slot}` + (a.kind === 'new' ? `&category=${a.cat}` : '');
    later(humanDelay(), () => {          // laiką žymime išeinant, ne planuojant (kitaip ilga „žmogiška“ pauzė pasendina užduotį)
      try { const q = JSON.parse(GM_getValue('pending', 'null')); if (q) { q.ts = Date.now(); GM_setValue('pending', JSON.stringify(q)); } } catch (e) {}
      GM_setValue('navTs', Date.now());
      location.href = url;
    });
  }

  async function onBuild() {
    let p;
    try { p = JSON.parse(GM_getValue('pending', 'null')); } catch (e) { p = null; }
    if (!p || Date.now() - p.ts > 120000 || p.did !== DID) return;
    const id = new URL(location.href).searchParams.get('id');
    if (String(p.slot) !== id) return;
    GM_setValue('pending', 'null');

    await sleep(humanDelay() * 1000);
    let btn = null, anyBtn = null;
    if (p.kind === 'new') {
      const find = () => document.querySelector('#contract_building' + p.gid);
      let w = find();
      if (!w) {                                                      // pastatas gali būti kitame kategorijos skirtuke
        for (const tab of document.querySelectorAll('.contentNavi a.tabItem, a.tabItem')) {
          if (tab.classList.contains('active')) continue;
          tab.click(); await sleep(1500);
          w = find(); if (w) break;
        }
      }
      btn = w && (w.querySelector('button.green.new') || w.querySelector('button.green'));
      anyBtn = w && w.querySelector('button');
    } else {
      btn = document.querySelector('.upgradeButtonsContainer button.green.build, button.green.build');
      anyBtn = document.querySelector('.upgradeButtonsContainer button, button.build');
    }
    // Ilgesnėms statyboms – „Construct 25% faster“ (reklama ~30 s, statyba prasideda pati)
    let usedVideo = false;
    if (btn && VIDEO_BOOST && GM_getValue('videoBoost', true) && Date.now() >= (GM_getValue('videoOffUntil', 0) || 0)) {
      const scope = (p.kind === 'new' ? document.querySelector('#contract_building' + p.gid) : document.querySelector('.upgradeButtonsContainer')) || document;
      const vbtn = scope.querySelector('button.videoFeatureButton');
      const ds = (scope.querySelector('.section1 .value') || {}).textContent || '';
      const m = ds.trim().match(/^(\d+):(\d\d):(\d\d)$/);
      const sec = m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : 0;
      if (vbtn && !vbtn.disabled && !/disabled/.test(vbtn.className) && sec > VIDEO_MIN_SEC) {
        GM_setValue('builtTs', Date.now());
        vbtn.click();
        usedVideo = true;
        log('Paspausta su reklama:', p.desc, ds.trim());
        clearFail(p.key);
        await sleep(rand(...VIDEO_WAIT) * 1000);
        const vd = document.querySelector('.videoFeatureVideoDialog');
        if (vd && vd.offsetParent) {      // reklama neužsidarė – nebandom 2 val.
          GM_setValue('videoOffUntil', Date.now() + 2 * 3600 * 1000);
          setStatus('reklamos langas neužsidarė – pagreitinimas išjungtas 2 val.');
          log('Reklamos langas neužsidarė');
        }
      }
    }
    if (usedVideo) { /* jau paspausta */ }
    else if (btn) { GM_setValue('builtTs', Date.now()); btn.click(); log('Paspausta:', p.desc); clearFail(p.key); }
    else {
      log('Mygtuko nėra:', p.desc);
      if (!anyBtn) registerFail(p.key);          // jokio mygtuko = trūksta reikalavimų / pasikeitusi struktūra
      if (p.lane === 'building') vset('blockedUntil', Date.now() + rand(...RETRY) * 1000);
    }
    later(rand(3, 8), () => (location.href = '/dorf1.php'));
  }

  // ---- Kaimo kėlimo eigos žurnalas: kas ir kada pakilo (nuo pirmo matymo valandomis) – vėliau naudojamas planui tobulinti ----
  function recordProgress(builds, fields) {
    const snap = vget('snap', null), now = Date.now();
    const cur = { b: {}, f: {} };
    for (const b of builds) if (b.gid) cur.b[b.gid] = Math.max(cur.b[b.gid] || 0, b.lvl);
    for (const f of fields) cur.f[f.slot] = f.lvl;
    const logA = jget('progLog', []);
    let t0 = GM_getValue('progStart', 0); if (!t0) { t0 = now; GM_setValue('progStart', now); }
    const h = +((now - t0) / 3600000).toFixed(2);
    if (snap) {
      for (const g in cur.b) if ((cur.b[g] || 0) > (snap.b[g] || 0)) logA.push({ h, v: DID, b: +g, l: cur.b[g] });
      for (const sl in cur.f) if ((cur.f[sl] || 0) > (snap.f[sl] || 0)) logA.push({ h, v: DID, f: +sl, gid: (fields.find(x => x.slot === +sl) || {}).gid, l: cur.f[sl] });
    }
    vset('snap', cur);
    jset('progLog', logA.slice(-3000));
  }
  function exportProgress() {
    const data = { world: location.hostname, exported: new Date().toISOString(), start: GM_getValue('progStart', 0), log: jget('progLog', []), prev: jget('progLogPrev', null) };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
    a.download = 'travian-eiga-' + location.hostname.split('.')[0] + '.json';
    document.body.appendChild(a); a.click(); a.remove();
  }

  // Naujas serveris / nauja paskyra: išvalyti visus ankstesnio pasaulio duomenis (paliekami tik jungikliai ir ankstesnė eiga)
  if (!/^lobby\./.test(location.hostname) && GM_getValue('world', '') !== location.hostname) {
    try { const old = GM_getValue('progLog', ''); if (old && old !== '[]') GM_setValue('progLogPrev', JSON.stringify({ world: GM_getValue('world', ''), start: GM_getValue('progStart', 0), log: JSON.parse(old) })); } catch (e) {}
    const keep = ['enabled', 'videoBoost', 'heroAutoRes', 'oasisMode', 'trainOn', 'cagesOn', 'progLogPrev'];
    try { for (const k of GM_listValues()) if (!keep.includes(k)) GM_deleteValue(k); } catch (e) {}
    GM_setValue('world', location.hostname);
    GM_setValue('worldName', location.hostname.split('.')[0]);
    log('Naujas pasaulis – ankstesni duomenys išvalyti:', location.hostname);
  }
  // Lobby kortelėje rašomas pasaulio pavadinimas (pvz. „International 30“), ne „ts30“ – įsimenam skirtuko pavadinimą
  if (!/^lobby\./.test(location.hostname) && /\S/.test(document.title) && !/travian/i.test(document.title)) GM_setValue('worldTitle', document.title.trim());

  // Lobby: po atsijungimo grįžti į žaidimą („Žaisti dabar“)
  if (/^lobby\./.test(location.hostname)) {
    if (!enabled() || !AUTO_RELOGIN) return;
    if (document.querySelector('input[type=password]')) { log('Lobby prašo prisijungti – to nedarau'); return; }
    const wait = inPause() ? pauseWakeSec() : rand(25, 150);          // naktį – tik ryte, kaip žmogus
    later(wait, () => {
      if (Date.now() - (GM_getValue('reloginTs', 0) || 0) < 10 * 60000) { log('Ką tik bandyta grįžti – laukiu'); return later(rand(600, 900), () => location.reload()); }
      const btns = [...document.querySelectorAll('button.playNow, button, a')].filter(b => b.offsetParent && /žaisti dabar|play now|jetzt spielen/i.test(b.textContent));
      // Kortelė = artimiausias tėvas, kuriame yra tik vienas „Žaisti dabar“; jos tekste turi būti pasaulio pavadinimas (tikslus žodis, kad „30“ nesutaptų su „3“)
      const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const names = [GAME_WORLD, GM_getValue('worldTitle', ''), GM_getValue('worldName', '')].filter(Boolean);
      const card = b => { let c = b.parentElement; for (let i = 0; i < 10 && c; i++) {
        const n = [...c.querySelectorAll('button, a')].filter(x => btns.includes(x) && !btns.some(y => y !== x && x.contains(y))).length;   // <a><button> skaičiuojam kaip vieną
        if (n > 1) return false;
        if (names.some(nm => new RegExp('(^|[^\\w])' + esc(nm) + '($|[^\\w])', 'i').test(c.textContent))) return true;
        c = c.parentElement; } return false; };
      const btn = btns.find(card) || (btns.length === 1 ? btns[0] : null);
      if (!btn && btns.length > 1) log('Lobby: keli pasauliai, savo neatpažinau. Ieškota:', names.join(' / '));
      if (!btn) { log('Lobby: „Žaisti dabar“ nerastas'); return; }
      GM_setValue('reloginTs', Date.now());
      GM_setValue('sessEnd', 0); GM_setValue('breakEnd', 0);
      log('Lobby: grįžtu į žaidimą');
      btn.click();
    });
    return;
  }

  addUI();
  // Naujoko apsauga – pabaiga nuskaitoma automatiškai iš užrašo „Dar turite 21:19:48 val. naujoko apsaugos“ (nieko įrašinėti nereikia)
  try {
    const pm = clean(document.body.innerText).match(/(?:(\d+)\s*d\.?\s*)?(\d+):(\d\d):(\d\d)[^\n]{0,25}?(?:naujoko apsaug|beginner.?s protection)/i);
    if (pm) {
      const end = Date.now() + ((+(pm[1] || 0) * 24 + +pm[2]) * 3600 + +pm[3] * 60 + +pm[4]) * 1000;
      GM_setValue('protEnd', end - 10 * 60000);                         // 10 min. atsarga
      GM_setValue('protSeen', Date.now());
    }
  } catch (e) {}
  if (!enabled()) { setStatus('išjungta'); return; }
  const path = location.pathname;
  // Sargas: jei skriptas atvedė į kitą puslapį, o po kelių minučių vis dar čia – grįžti į dorf1 (kad niekada neužstrigtų)
  if (!path.includes('dorf1') && Date.now() - (GM_getValue('navTs', 0) || 0) < 90000) {
    const here = location.href;
    later(rand(360, 600), () => { if (location.href === here && enabled()) { log('Sargas: užstrigta, grįžtu į dorf1'); location.href = '/dorf1.php'; } });
  } else if (!path.includes('dorf1')) {
    // Puslapį atidarė žmogus (ne skriptas): jei 3+ min. niekas nejuda ir darbo nėra – grįžtu į dorf1, kad botas nestovėtų
    let act = Date.now();
    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(ev => document.addEventListener(ev, () => { act = Date.now(); }, { passive: true }));
    const back = () => {
      if (!enabled()) return;
      const choreLive = !!GM_getValue('chore', '') && Date.now() - (GM_getValue('choreTs', 0) || 0) < 120000;   // pasenęs (nebaigtas) darbas negali laikyti puslapio amžinai
      if (Date.now() - act < 180000 || choreLive) return later(rand(45, 90), back);
      log('Sargas: stoviu ne dorf1 be darbo – grįžtu'); location.href = '/dorf1.php';
    };
    later(rand(200, 300), back);
  }
  if (path.includes('dorf1')) onDorf1();
  else if (path.includes('/tasks')) onTasks();
  else if (path.includes('/hero')) onHero();
  else if (path.includes('build') && chorePending('cp')) onCp();
  else if (path.includes('build') && chorePending('celebrate')) onCelebrate();
  else if (path.includes('build') && (chorePending('raidSend') || chorePending('raidConfirm') || chorePending('raidDone'))) onRaidSend();
  else if (path.includes('build') && chorePending('research')) onResearch();
  else if (path.includes('build') && chorePending('npc')) onNpc();
  else if (path.includes('build') && chorePending('offer')) onOffer();
  else if (path.includes('build') && chorePending('supply')) onSupply();
  else if (path.includes('build') && chorePending('demolish')) onDemolish();
  else if (path.includes('build') && chorePending('vlRun')) onVlRun();
  else if (path.includes('build') && chorePending('vlStart')) onVlStart();
  else if (path.includes('build') && chorePending('flRun')) onFlRun();
  else if (path.includes('build') && chorePending('flStart')) onFlStart();
  else if (path.includes('build') && chorePending('cropBuy')) onCropBuy();
  else if (path.includes('build') && chorePending('trade')) onTrade();
  else if (path.includes('build') && (chorePending('recall') || chorePending('recallConfirm'))) onRecall();
  else if (path.includes('build') && (chorePending('train') || chorePending('trainDone'))) onTrain();
  else if (path.includes('build') && (chorePending('oasisSend') || chorePending('oasisConfirm') || chorePending('oasisDone'))) onRally();
  else if (path.includes('build')) onBuild();
  else if (path.includes('auctions') && (chorePending('auction') || chorePending('aucMap'))) onAuction();
  else if (path.includes('karte') && chorePending('farmScan')) onFarmScan();
  else if (path.includes('karte') && chorePending('siteScan')) onSiteScan();
  else if (path.includes('karte') && chorePending('eoScan')) onEoScan();
  else if (path.includes('karte')) onMap();
  else if (/dorf2|statistics|report/.test(path)) onWander();
})();
