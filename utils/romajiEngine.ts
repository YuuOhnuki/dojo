/**
 * Romanji Input Engine
 * 日本語ローマ字入力の複雑な対応（複数パターン、文中動的判定）を実装
 */

export interface CharCheckResult {
    isCorrect: boolean;
    consumedLength: number;
    nextIndex: number;
    remainingInput: string;
}

const ROMAJI_MAP: Record<string, string[]> = {
    // ひらがな基本
    あ: ['a'],
    い: ['i'],
    う: ['u'],
    え: ['e'],
    お: ['o'],
    か: ['ka'],
    き: ['ki'],
    く: ['ku'],
    け: ['ke'],
    こ: ['ko'],
    が: ['ga'],
    ぎ: ['gi'],
    ぐ: ['gu'],
    げ: ['ge'],
    ご: ['go'],
    さ: ['sa'],
    し: ['shi', 'si'],
    す: ['su'],
    せ: ['se'],
    そ: ['so'],
    ざ: ['za'],
    じ: ['ji', 'zi'],
    ず: ['zu'],
    ぜ: ['ze'],
    ぞ: ['zo'],
    た: ['ta'],
    ち: ['chi', 'ti'],
    つ: ['tsu', 'tu'],
    て: ['te'],
    と: ['to'],
    だ: ['da'],
    ぢ: ['di'],
    づ: ['du'],
    で: ['de'],
    ど: ['do'],
    な: ['na'],
    に: ['ni'],
    ぬ: ['nu'],
    ね: ['ne'],
    の: ['no'],
    は: ['ha'],
    ひ: ['hi'],
    ふ: ['fu', 'hu'],
    へ: ['he'],
    ほ: ['ho'],
    ば: ['ba'],
    び: ['bi'],
    ぶ: ['bu'],
    べ: ['be'],
    ぼ: ['bo'],
    ぱ: ['pa'],
    ぴ: ['pi'],
    ぷ: ['pu'],
    ぺ: ['pe'],
    ぽ: ['po'],
    ま: ['ma'],
    み: ['mi'],
    む: ['mu'],
    め: ['me'],
    も: ['mo'],
    や: ['ya'],
    ゆ: ['yu'],
    よ: ['yo'],
    ら: ['ra'],
    り: ['ri'],
    る: ['ru'],
    れ: ['re'],
    ろ: ['ro'],
    わ: ['wa'],
    ゐ: ['wi'],
    ゑ: ['we'],
    を: ['wo', 'o'],
    ん: ['n', 'nn'],

    // ひらがな拗音
    きゃ: ['kya'],
    きゅ: ['kyu'],
    きょ: ['kyo'],
    ぎゃ: ['gya'],
    ぎゅ: ['gyu'],
    ぎょ: ['gyo'],
    しゃ: ['sha', 'sya'],
    しゅ: ['shu', 'syu'],
    しょ: ['sho', 'syo'],
    じゃ: ['ja', 'jya', 'zya'],
    じゅ: ['ju', 'jyu', 'zyu'],
    じょ: ['jo', 'jyo', 'zyo'],
    ちゃ: ['cha', 'tya'],
    ちゅ: ['chu', 'tyu'],
    ちょ: ['cho', 'tyo'],
    にゃ: ['nya'],
    にゅ: ['nyu'],
    にょ: ['nyo'],
    ひゃ: ['hya'],
    ひゅ: ['hyu'],
    ひょ: ['hyo'],
    びゃ: ['bya'],
    びゅ: ['byu'],
    びょ: ['byo'],
    ぴゃ: ['pya'],
    ぴゅ: ['pyu'],
    ぴょ: ['pyo'],
    みゃ: ['mya'],
    みゅ: ['myu'],
    みょ: ['myo'],
    りゃ: ['rya'],
    りゅ: ['ryu'],
    りょ: ['ryo'],

    // カタカナ基本
    ア: ['a'],
    イ: ['i'],
    ウ: ['u'],
    エ: ['e'],
    オ: ['o'],
    カ: ['ka'],
    キ: ['ki'],
    ク: ['ku'],
    ケ: ['ke'],
    コ: ['ko'],
    ガ: ['ga'],
    ギ: ['gi'],
    グ: ['gu'],
    ゲ: ['ge'],
    ゴ: ['go'],
    サ: ['sa'],
    シ: ['shi', 'si'],
    ス: ['su'],
    セ: ['se'],
    ソ: ['so'],
    ザ: ['za'],
    ジ: ['ji', 'zi'],
    ズ: ['zu'],
    ゼ: ['ze'],
    ゾ: ['zo'],
    タ: ['ta'],
    チ: ['chi', 'ti'],
    ツ: ['tsu', 'tu'],
    テ: ['te'],
    ト: ['to'],
    ダ: ['da'],
    ヂ: ['di'],
    ヅ: ['du'],
    デ: ['de'],
    ド: ['do'],
    ナ: ['na'],
    ニ: ['ni'],
    ヌ: ['nu'],
    ネ: ['ne'],
    ノ: ['no'],
    ハ: ['ha'],
    ヒ: ['hi'],
    フ: ['fu', 'hu'],
    ヘ: ['he'],
    ホ: ['ho'],
    バ: ['ba'],
    ビ: ['bi'],
    ブ: ['bu'],
    ベ: ['be'],
    ボ: ['bo'],
    パ: ['pa'],
    ピ: ['pi'],
    プ: ['pu'],
    ペ: ['pe'],
    ポ: ['po'],
    マ: ['ma'],
    ミ: ['mi'],
    ム: ['mu'],
    メ: ['me'],
    モ: ['mo'],
    ヤ: ['ya'],
    ユ: ['yu'],
    ヨ: ['yo'],
    ラ: ['ra'],
    リ: ['ri'],
    ル: ['ru'],
    レ: ['re'],
    ロ: ['ro'],
    ワ: ['wa'],
    ヲ: ['wo', 'o'],
    ン: ['n', 'nn'],

    // カタカナ拗音
    キャ: ['kya'],
    キュ: ['kyu'],
    キョ: ['kyo'],
    ギャ: ['gya'],
    ギュ: ['gyu'],
    ギョ: ['gyo'],
    シャ: ['sha', 'sya'],
    シュ: ['shu', 'syu'],
    ショ: ['sho', 'syo'],
    ジャ: ['ja', 'jya', 'zya'],
    ジュ: ['ju', 'jyu', 'zyu'],
    ジョ: ['jo', 'jyo', 'zyo'],
    チャ: ['cha', 'tya'],
    チュ: ['chu', 'tyu'],
    チョ: ['cho', 'tyo'],
    ニャ: ['nya'],
    ニュ: ['nyu'],
    ニョ: ['nyo'],
    ヒャ: ['hya'],
    ヒュ: ['hyu'],
    ヒョ: ['hyo'],
    ビャ: ['bya'],
    ビュ: ['byu'],
    ビョ: ['byo'],
    ピャ: ['pya'],
    ピュ: ['pyu'],
    ピョ: ['pyo'],
    ミャ: ['mya'],
    ミュ: ['myu'],
    ミョ: ['myo'],
    リャ: ['rya'],
    リュ: ['ryu'],
    リョ: ['ryo'],
};

const SMALL_KANA_MAP: Record<string, string[]> = {
    ぁ: ['xa', 'la'],
    ぃ: ['xi', 'li'],
    ぅ: ['xu', 'lu'],
    ぇ: ['xe', 'le'],
    ぉ: ['xo', 'lo'],
    ゃ: ['xya', 'lya'],
    ゅ: ['xyu', 'lyu'],
    ょ: ['xyo', 'lyo'],
    ゎ: ['xwa', 'lwa'],
    ァ: ['xa', 'la'],
    ィ: ['xi', 'li'],
    ゥ: ['xu', 'lu'],
    ェ: ['xe', 'le'],
    ォ: ['xo', 'lo'],
    ャ: ['xya', 'lya'],
    ュ: ['xyu', 'lyu'],
    ョ: ['xyo', 'lyo'],
    ヮ: ['xwa', 'lwa'],
};

export class RomajiEngine {
    private japaneseMaps: Record<string, string[]> = {};
    private romajiToJapaneseMap: Map<string, string> = new Map();
    private static readonly MAX_CANDIDATE_COUNT = 4096;

    constructor() {
        this.japaneseMaps = ROMAJI_MAP;
        for (const [japanese, romajiList] of Object.entries(this.japaneseMaps)) {
            for (const romaji of romajiList) {
                if (!this.romajiToJapaneseMap.has(romaji)) {
                    this.romajiToJapaneseMap.set(romaji, japanese);
                }
            }
        }
    }

    toRomaji(japanese: string): string {
        let result = '';
        let i = 0;

        while (i < japanese.length) {
            let matched = false;

            if (i + 1 < japanese.length) {
                const twoChar = japanese.substring(i, i + 2);
                if (twoChar in this.japaneseMaps) {
                    result += this.japaneseMaps[twoChar][0];
                    i += 2;
                    matched = true;
                }
            }

            if (!matched) {
                const char = japanese[i];
                if (char in this.japaneseMaps) {
                    result += this.japaneseMaps[char][0];
                } else {
                    result += char;
                }
                i += 1;
            }
        }

        return result;
    }

    checkInput(japanese: string, japaneseIndex: number, userInput: string): CharCheckResult {
        if (japaneseIndex >= japanese.length || !userInput) {
            return {
                isCorrect: false,
                consumedLength: 0,
                nextIndex: japaneseIndex,
                remainingInput: userInput,
            };
        }

        // 2文字マッチング
        if (japaneseIndex + 1 < japanese.length) {
            const twoChar = japanese.substring(japaneseIndex, japaneseIndex + 2);
            if (twoChar in this.japaneseMaps) {
                const validRomajiList = this.japaneseMaps[twoChar];
                for (const validRomaji of validRomajiList) {
                    if (userInput.startsWith(validRomaji)) {
                        return {
                            isCorrect: true,
                            consumedLength: validRomaji.length,
                            nextIndex: japaneseIndex + 2,
                            remainingInput: userInput.slice(validRomaji.length),
                        };
                    }
                }
            }
        }

        // 1文字マッチング
        const oneChar = japanese[japaneseIndex];
        if (oneChar in this.japaneseMaps) {
            const validRomajiList = this.japaneseMaps[oneChar];
            for (const validRomaji of validRomajiList) {
                if (userInput.startsWith(validRomaji)) {
                    return {
                        isCorrect: true,
                        consumedLength: validRomaji.length,
                        nextIndex: japaneseIndex + 1,
                        remainingInput: userInput.slice(validRomaji.length),
                    };
                }
            }
        }

        // 直接比較
        if (oneChar === userInput[0]) {
            return {
                isCorrect: true,
                consumedLength: 1,
                nextIndex: japaneseIndex + 1,
                remainingInput: userInput.slice(1),
            };
        }

        return {
            isCorrect: false,
            consumedLength: 1,
            nextIndex: japaneseIndex,
            remainingInput: userInput,
        };
    }

    analyzeFullInput(
        japanese: string,
        userInput: string,
    ): {
        correctCount: number;
        errorCount: number;
        japaneseIndex: number;
        userInputIndex: number;
    } {
        let japaneseIndex = 0;
        let userInputIndex = 0;
        let correctCount = 0;
        let errorCount = 0;

        while (japaneseIndex < japanese.length && userInputIndex < userInput.length) {
            const result = this.checkInput(japanese, japaneseIndex, userInput.slice(userInputIndex));

            if (result.isCorrect) {
                correctCount++;
                japaneseIndex = result.nextIndex;
                userInputIndex += result.consumedLength;
            } else {
                errorCount++;
                japaneseIndex += 1;
                userInputIndex += 1;
            }
        }

        return {
            correctCount,
            errorCount,
            japaneseIndex,
            userInputIndex,
        };
    }

    getNextCharHint(japanese: string, japaneseIndex: number): string {
        if (japaneseIndex >= japanese.length) {
            return '';
        }

        if (japaneseIndex + 1 < japanese.length) {
            const twoChar = japanese.substring(japaneseIndex, japaneseIndex + 2);
            if (twoChar in this.japaneseMaps) {
                return this.japaneseMaps[twoChar][0];
            }
        }

        const oneChar = japanese[japaneseIndex];
        if (oneChar in this.japaneseMaps) {
            return this.japaneseMaps[oneChar][0];
        }

        return oneChar;
    }

    /**
     * 日本語文字列から有効なローマ字候補を列挙する。
     * 例: つ => ["tsu", "tu"] / し => ["shi", "si"]
     */
    getRomajiCandidates(japanese: string): string[] {
        const candidates: string[] = [];
        const visited = new Set<string>();

        const dfs = (index: number, current: string) => {
            if (candidates.length >= RomajiEngine.MAX_CANDIDATE_COUNT) return;

            const visitKey = `${index}:${current}`;
            if (visited.has(visitKey)) return;
            visited.add(visitKey);

            if (index >= japanese.length) {
                candidates.push(current);
                return;
            }

            const options = this.getKanaOptions(japanese, index);
            for (const option of options) {
                dfs(index + option.consume, `${current}${option.romaji}`);
            }
        };

        dfs(0, '');

        return Array.from(new Set(candidates));
    }

    /**
     * 既存ローマ字表記からIME互換の入力候補を展開する。
     */
    getImeVariantsFromRomaji(romaji: string): string[] {
        if (!romaji) return [];
        return this.expandImeVariants([romaji]);
    }

    private getKanaOptions(japanese: string, index: number): Array<{ romaji: string; consume: number }> {
        if (index >= japanese.length) {
            return [];
        }

        const char = japanese[index];
        const nextChar = japanese[index + 1] ?? '';
        const options: Array<{ romaji: string; consume: number }> = [];

        if (char === 'っ' || char === 'ッ') {
            const nextOptions = this.getKanaOptions(japanese, index + 1)
                .map((option) => option.romaji[0])
                .filter((head) => /^[bcdfghjklmpqrstvwxyz]$/.test(head));

            const doubled = Array.from(new Set(nextOptions));
            for (const consonant of doubled) {
                options.push({ romaji: consonant, consume: 1 });
            }

            options.push({ romaji: 'xtsu', consume: 1 });
            options.push({ romaji: 'ltsu', consume: 1 });
            options.push({ romaji: 'xtu', consume: 1 });
            options.push({ romaji: 'ltu', consume: 1 });

            return options;
        }

        if (char === 'ん' || char === 'ン') {
            options.push({ romaji: 'nn', consume: 1 });
            options.push({ romaji: "n'", consume: 1 });

            const nextHeadOptions = this.getKanaOptions(japanese, index + 1).map((option) => option.romaji[0]);
            const startsWithVowelOrYOrN = nextHeadOptions.some((head) => /[aiuenyo]/.test(head));
            if (!startsWithVowelOrYOrN || nextChar === '' || /[\s.,!?'"():;-]/.test(nextChar)) {
                options.push({ romaji: 'n', consume: 1 });
            }

            return options;
        }

        if (char === 'ー') {
            options.push({ romaji: '-', consume: 1 });
            return options;
        }

        if (SMALL_KANA_MAP[char]) {
            for (const romaji of SMALL_KANA_MAP[char]) {
                options.push({ romaji, consume: 1 });
            }
            return options;
        }

        if (index + 1 < japanese.length) {
            const twoChar = japanese.substring(index, index + 2);
            if (twoChar in this.japaneseMaps) {
                for (const romaji of this.expandImeVariants(this.japaneseMaps[twoChar])) {
                    options.push({ romaji, consume: 2 });
                }
            }
        }

        if (char in this.japaneseMaps) {
            for (const romaji of this.expandImeVariants(this.japaneseMaps[char])) {
                options.push({ romaji, consume: 1 });
            }
        }

        if (options.length === 0) {
            options.push({ romaji: char, consume: 1 });
        }

        return options;
    }

    private expandImeVariants(romajiList: string[]): string[] {
        const set = new Set<string>();
        const queue = [...romajiList];

        for (const romaji of romajiList) {
            set.add(romaji);
        }

        const replacementPairs: Array<[RegExp, string]> = [
            [/shi/g, 'si'],
            [/si/g, 'shi'],
            [/chi/g, 'ti'],
            [/ti/g, 'chi'],
            [/tsu/g, 'tu'],
            [/tu/g, 'tsu'],
            [/fu/g, 'hu'],
            [/hu/g, 'fu'],
            [/ji/g, 'zi'],
            [/zi/g, 'ji'],
            [/cha/g, 'tya'],
            [/tya/g, 'cha'],
            [/cha/g, 'cya'],
            [/cya/g, 'cha'],
            [/chu/g, 'tyu'],
            [/tyu/g, 'chu'],
            [/chu/g, 'cyu'],
            [/cyu/g, 'chu'],
            [/cho/g, 'tyo'],
            [/tyo/g, 'cho'],
            [/cho/g, 'cyo'],
            [/cyo/g, 'cho'],
            [/sha/g, 'sya'],
            [/sya/g, 'sha'],
            [/shu/g, 'syu'],
            [/syu/g, 'shu'],
            [/sho/g, 'syo'],
            [/syo/g, 'sho'],
            [/ja/g, 'jya'],
            [/jya/g, 'ja'],
            [/ju/g, 'jyu'],
            [/jyu/g, 'ju'],
            [/jo/g, 'jyo'],
            [/jyo/g, 'jo'],
            [/ja/g, 'zya'],
            [/zya/g, 'ja'],
            [/ju/g, 'zyu'],
            [/zyu/g, 'ju'],
            [/jo/g, 'zyo'],
            [/zyo/g, 'jo'],
        ];

        const consonantForSingleN = '[bcdfghjklmpqrstvwxyz]';
        const nVariantTransforms: Array<(value: string) => string[]> = [
            // ん + 子音は nn / n の両方をIME互換として許容
            (value) => [value.replace(new RegExp(`nn(${consonantForSingleN})`, 'g'), 'n$1')],
            (value) => [value.replace(new RegExp(`(^|[^n])n(${consonantForSingleN})`, 'g'), '$1nn$2')],
            // 文末・記号前の ん は n でも nn でも許容
            (value) => [value.replace(/nn($|[\s.,!?'"():;-])/g, 'n$1')],
            (value) => [value.replace(/(^|[^n])n($|[\s.,!?'"():;-])/g, '$1nn$2')],
            // n' も同義として往復
            (value) => [value.replace(/nn([aiueoy])/g, "n'$1")],
            (value) => [value.replace(/n'([aiueoy])/g, 'nn$1')],
        ];

        while (queue.length > 0 && set.size < 512) {
            const current = queue.shift()!;
            for (const [pattern, replacement] of replacementPairs) {
                const converted = current.replace(pattern, replacement);
                if (converted !== current && !set.has(converted)) {
                    set.add(converted);
                    queue.push(converted);
                }
            }

            for (const transform of nVariantTransforms) {
                for (const converted of transform(current)) {
                    if (converted !== current && !set.has(converted)) {
                        set.add(converted);
                        queue.push(converted);
                    }
                }
            }
        }

        return Array.from(set);
    }
}

export const romajiEngine = new RomajiEngine();
