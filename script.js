/**
 * @file script.js
 * @brief 青空文庫現代語訳HTMLの主要なスクリプト。
 * @author もるたう
 * @copyright © 2025 もるたう. All rights reserved.
 */

// **** 定義 ****
/** feature-content.html の読み込み完了の解決 */
const loadFeatureContent = loadHtmlFile('feature-content.html', 'header');

// **** 変数 ****
/** 本文行数 */
let mainRowCount = 0;
/** ブックマークリスト */
let bookmarkRows = [];
/** main要素 */
let mainElement;
/** footer要素 */
let footerElement;
/** コンテキストメニュー要素の要素 */
let customContextMenuElement;
/** ブックマークモーダルウィンドウの要素 */
let bookmarkListsModalElement;
/** 本文変更モーダルウィンドウの要素 */
let editSentenceModalElement;
/** 汎用メッセージボックスモーダルウィンドウの要素 */
let commonMessageBoxModalElement;
/** 編集内容のファイル読み込みボタンの要素 */
let editDataJsonFileInputElement;
/** mainの原文の文書 */
let mainOriginalLines = [];
/** mainの現代語訳の文書 */
let mainTranslatedLines = [];
/** 変更行の連想配列 */
let modRows = {};


// **** 関数 ****

/**
 * テキストから「［＃N字下げ］」形式の字下げ指定を抽出し、その数値と指定削除後のテキストを返す。
 * @brief
 * * 全角数字は半角に変換され、数値として返される。
 * * 複数マッチ時は最初の字下げ指定のみが処理される。
 * @param {string} text 処理対象となる行のテキスト。
 * @returns {{number: number, cleanedLine: string}|null}
 * * 字下げ数 (`number`) と削除後のテキスト (`cleanedLine`) を持つオブジェクト、
 *   または指定が見つからない場合は `null`。
 */
function extractIndentInfo(line) {
	// ［＃ に始まり、数字（1桁以上）、字下げ］で終わるパターン
	const pattern = /［＃\s*(\p{Number}+)\s*字下げ］/gu;
	// マッチした文字列を抽出
	const matches = Array.from(line.matchAll(pattern));
	if (matches.length > 0) {
		return {
			// 全角数字を含む文字列を半角数字に変換し、数値にする
			// { number: 字下げ数, cleanedLine: ［＃(数字)字下げ］の文字列削除した文字列 }
			number: Number(matches[0][1].normalize('NFKC')), cleanedLine: line.replace(pattern, '')
		};
	} else {
		return null;
	}
}

/**
 * 要素のIDから行番号を取得する
 * @breif '*row-NNN'の形式のIDから、「NNN」の数字を行番号として取得する。
 * @param {string} id 行番号を含む要素のID
 * @returns {number} 行番号 (取得できない場合は0)
 */
function getRowNumberFromElementId(id) {
	let rowNumber = 0;
	const lastRowStringIndex = id.lastIndexOf('row-');
	if (lastRowStringIndex >= 0) {
		rowNumber = Number(id.substring(lastRowStringIndex + 4)) || 0;
	}
	return rowNumber;
}

/**
 * テキスト行に含まれるルビ指定をHTMLの<ruby>タグ形式に変換する。
 * @brief
 *   「漢字《ひらがな》」または「｜漢字《ひらがな》」の形式に対応する。
 *   * 正規表現に日本語の漢字とひらがな、カタカナのUnicodeプロパティを使用
 *   * 「漢字《ひらがな》」 => <ruby><rb>漢字</rb><rb>漢字</rb><rp>（</rp><rt>ひらがな</rt><rp>）</rp></ruby>
 * @param {string} line 処理対象となる1行のテキスト。
 * @returns {string} ルビがHTML <ruby>タグに変換された後の文字列。
 */
function convertRubyToHtml(line) {
	// 「｜漢字《ひらがな》」の形式を処理するための正規表現
	const tategakiRubyPattern = /｜(\p{sc=Han}+?)《([\p{sc=Hiragana}\p{sc=Katakana}]+?)》/gu;
	// 「｜漢字《ひらがな》」-> <ruby><rb>漢字</rb><rp>（</rp><rt>ひらがな</rt><rp>）</rp></ruby>
	let processedLine = line.replace(tategakiRubyPattern, (match, kanji, ruby) => {
		return `<ruby><rb>${kanji}</rb><rp>（</rp><rt>${ruby}</rt><rp>）</rp></ruby>`;
	});

	// 漢字《ひらがな》」の形式を処理するための正規表現
	const normalRubyPattern = /(\p{sc=Han}+?)《([\p{sc=Hiragana}\p{sc=Katakana}]+?)》/gu;
	// 「漢字《ひらがな》」-> <ruby><rb>漢字</rb><rp>（</rp><rt>ひらがな</rt><rp>）</rp></ruby>
	processedLine = processedLine.replace(normalRubyPattern, (match, kanji, ruby) => {
		return `<ruby><rb>${kanji}</rb><rp>（</rp><rt>${ruby}</rt><rp>）</rp></ruby>`;
	});

	return processedLine;
}

/**
 * テキストに含まれるURLをリンクにする
 * @brief http:// または https:// で始まるURLを
 * @param {*} text 対象となるテキスト
 * @returns URLがリンクに置換されたテキスト
 */
function convertUrlsToLinks(text) {
	// 正規表現で http:// または https:// で始まるURLを検出
	const urlRegex = /(https?:\/\/[^\s<>'\{\}\[\]`:]+)/g;
	// テキストをリンクに置換して返す
	return text.replace(urlRegex, function (url) {
		let balance = 0, removeIndex = -1, after = '';
		// マッチしたURL文字列の末尾から文字をチェック
		for (let i = 0; i < url.length; i++) {
			const char = url[i];
			if (char === ')' || char === '）') {
				balance--;
			} else if (char === '(' || char === '（') {
				balance++;
			}
			// バランスがマイナスになった場合、その括弧はURLの一部ではないと判断
			// ここで removeIndex を設定し、それ以降を削除する
			if (balance < 0) {
				removeIndex = i;
				break;
			}
		}
		// removeIndex が設定されていれば、そこまでの部分を finalUrl とする
		if (removeIndex !== -1) {
			after = url.substring(removeIndex);
			url = url.substring(0, removeIndex);
		}
		// キャプチャされたURLを<a>タグで囲む
		if (balance <= 0 && url.length >= 12) {
			return `<a href='${url}' target='_blank' rel='noopener noreferrer'>${url}</a>${after}`;
		} else {
			// 短すぎるものは不正なURLとしてリンクにしない
			// (が閉じられていない、破綻したものはリンクにしない
			return url;
		}
	});
}

/**
 * 吹き出しの位置をトリガー要素の上に配置する関数
 * @param {HTMLElement} triggerElement 吹き出しを表示するトリガーとなる要素
 * @param {HTMLElement} tooltipElement 表示する吹き出し要素
 */
function positionTooltip(triggerElement, tooltipElement) {
	// トリガー要素の画面上の位置とサイズを取得
	const triggerRect = triggerElement.getBoundingClientRect();
	// 吹き出し要素の現在のサイズを取得 (表示されていないと0になる場合があるので注意)
	const tooltipRect = tooltipElement.getBoundingClientRect();
	// 文字サイズ
	const fontSizePx = parseFloat(window.getComputedStyle(tooltipElement).fontSize);

	// 吹き出しをトリガー要素の上に配置するための計算
	const topPosition = triggerRect.top + window.scrollY - tooltipRect.height - fontSizePx;
	const leftPosition = triggerRect.left + window.scrollX - fontSizePx;	/* 左寄せ */
	// const leftPosition = triggerRect.left + window.scrollX + (triggerRect.width / 2) - (tooltipRect.width / 2); /* 中央揃え */

	// 画面の端からはみ出さないように調整 (左右)
	const screenPadding = fontSizePx; // 画面端からのパディング
	let finalLeft = Math.max(screenPadding, leftPosition);
	if (finalLeft + tooltipRect.width + screenPadding > window.innerWidth) {
		finalLeft = window.innerWidth - tooltipRect.width - screenPadding * 3;
	}
	// 画面の端からはみ出さないように調整 (上端)
	// スクロール位置を考慮する
	let finalTop = Math.max(window.scrollY + screenPadding, topPosition);

	tooltipElement.style.top = `${finalTop}px`;
	tooltipElement.style.left = `${finalLeft}px`;
}

/**
 * ブックマーク済みの行番号を配列で取得する。
 * @breif `main` 要素内の `.bookmark` クラスを持つ要素から、
 *   `row-XXX` 形式のidに定義されている行番号 (XXX) を抽出し、
 *   その数値の配列を返す。
 * @returns {number[]} ブックマーク行番号の配列
 */
function getBookmarkRows() {
	return Array.from(mainElement.querySelectorAll('.bookmark'))
		.map(element => {
			// 正規表現で 'row-\d' の数字をキャプチャグループで取得
			const match = element.id.match(/row-(\d+)\b/);
			// マッチが見つかれば 数字 を、見つからなければ null を返す
			return match ? Number(match[1]) : null;
		})
		// 有効な数値だけをフィルタリング
		.filter(number => number !== null);
}

/**
 * 外部のHTMLファイルを読み込み、指定した要素に挿入する関数
 * @param {string} url 読み込むHTMLファイルのURL
 * @param {string} targetSelector 読み込んだHTMLを挿入するCSSセレクタ (例: '#content-area')
 */
async function loadHtmlFile(url, targetSelector) {
	const targetElement = document.querySelector(targetSelector);

	if (!targetElement) {
		console.error(`Error: Target element with selector '${targetSelector}' not found.`);
		return;
	}

	try {
		const response = await fetch(url);

		if (!response.ok) {
			// HTTPエラー（404 Not Found, 500 Internal Server Errorなど）の場合
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		// レスポンスボディをテキストとして取得
		const htmlContent = await response.text();
		// 取得したHTMLを要素に挿入
		targetElement.innerHTML += htmlContent;

		console.log(`Successfully loaded ${url} into ${targetSelector}`);
	} catch (error) {
		console.error('Failed to load HTML file:', error);
	}
}

/**
 * JSONファイルを保存(ダウンロード)する
 * @param {string} filename ファイル名
 * @param {string} jsonContent JSONデータ
 */
async function saveJson(filename, jsonContent) {
	// Blobオブジェクトを作成
	const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' });
	// Blobから一時的なURLを作成
	const url = URL.createObjectURL(blob);
	// ダウンロード用のa要素（リンク）を動的に作成
	const a = document.createElement('a');
	a.href = url;
	// download属性にファイル名を指定
	a.download = filename;
	// ダウンロード用のAnkerタグを埋め込む
	document.body.appendChild(a);
	// Ankerクリックイベントを呼び出しファイルをダウンロードする。
	a.click();
	// ダウンロード用のAnkerタグを削除する
	document.body.removeChild(a);
	// Blobから一時的なURLを削除する
	URL.revokeObjectURL(url);
}

// **** 起動時実行処理 ****

/** HTMLファイル名（ローカルストレージ用） */
const addFilename = '_' + window.location.pathname.split('/').pop().substring(0, window.location.pathname.lastIndexOf('.') - 1);
{ // バージョン変更吸収 処理 // todo 8月に消す
	const tmp_aozoraModernJapaneseTranslation_FontSize = localStorage.getItem(`aozoraModernJapaneseTranslation_fontsize`);
	if (tmp_aozoraModernJapaneseTranslation_FontSize) {
		localStorage.setItem(`aozoraModernJapaneseTranslation_FontSize_${addFilename}`, tmp_aozoraModernJapaneseTranslation_FontSize);
		localStorage.removeItem(`aozoraModernJapaneseTranslation_fontsize`);
	}
	const tmp_aozoraModernJapaneseTranslation_BookmarkRows = localStorage.getItem(`aozoraModernJapaneseTranslation_BookmarkRows`);
	if (tmp_aozoraModernJapaneseTranslation_BookmarkRows) {
		localStorage.setItem(`aozoraModernJapaneseTranslation_BookmarkRows_${addFilename}`, tmp_aozoraModernJapaneseTranslation_BookmarkRows);
		localStorage.removeItem(`aozoraModernJapaneseTranslation_BookmarkRows`);
	}
	const tmp_aozoraModernJapaneseTranslation_ModRows = localStorage.getItem(`aozoraModernJapaneseTranslation_modRows`);
	if (tmp_aozoraModernJapaneseTranslation_ModRows) {
		localStorage.setItem(`aozoraModernJapaneseTranslation_ModRows_${addFilename}`, tmp_aozoraModernJapaneseTranslation_ModRows);
		localStorage.removeItem(`aozoraModernJapaneseTranslation_modRows`);
	}
}

// ローカルストレージからフォントサイズを読み込み反映する
document.body.classList.add(`size${Number(localStorage.getItem(`aozoraModernJapaneseTranslation_FontSize_${addFilename}`) || 3)}`);

// ローカルストレージからブックマークリストを読み込む
bookmarkRows = (localStorage.getItem(`aozoraModernJapaneseTranslation_BookmarkRows_${addFilename}`) ?? '')
	.split(',').map(row => row ? Number(row) : null).filter(number => number !== null);

// ローカルストレージ変更内容を読み込む
try {
	modRows = JSON.parse(localStorage.getItem(`aozoraModernJapaneseTranslation_ModRows_${addFilename}`)) ?? {};
} catch (error) {
	console.error('JSONファイルのパース中にエラーが発生しました:', error);
}

// 起動時ドキュメント読み込み後の処理
document.addEventListener('DOMContentLoaded', async function () {
	document.querySelector('h1').innerText = document.querySelector('meta[name="DC.Title"]').content;
	document.querySelector('.author').innerText = document.querySelector('meta[name="author"]').content;

	// mainタグとfooterタグの本文を配置する
	mainElement = document.querySelector('main');
	footerElement = document.querySelector('footer');

	/** 画面の状態を初期化する */
	const displayInitialize = () => [mainElement, footerElement].forEach((currentElement, index) => {
		const originalPreElement = currentElement.querySelector('pre.original-pre');
		const translatedPreElement = currentElement.querySelector('pre.translated-pre');
		let originalLines = originalPreElement?.innerHTML.replace(/\r?\n|\r/g, '\n').trim('\n').split('\n') ?? '';
		let translatedLines = translatedPreElement?.innerHTML.replace(/\r?\n|\r/g, '\n').trim('\n').split('\n') ?? '';
		// 原文と現代語訳で行数が一致しなければスキップ
		if (originalLines.length !== translatedLines.length) { return; }
		if (index === 0) {
			// mainタグ内の時、本文を記憶する
			// preタグ喪失している場合は、読み込んだデータから復活させる。
			if (originalLines) { mainOriginalLines = originalLines; } else { originalLines = mainOriginalLines; }
			if (translatedLines) { mainTranslatedLines = translatedLines; } else { translatedLines = mainTranslatedLines; }
		}

		// コンテンツの書き換え
		const length = originalLines.length;
		currentElement.innerHTML = '';

		for (let index = 0; index < length; index++) {
			const rowNumber = index + 1;
			const originalLine = originalLines[index];
			const translatedLine = translatedLines[index];
			if (originalLine === translatedLine && originalLine === '' && translatedLine === '' && (rowNumber in modRows) === false) {
				// 空白行は<br>タグ追加
				currentElement.appendChild(document.createElement('br'));
			} else {
				let idList = [];
				const lineList = [originalLine, translatedLine];
				if (originalLine === translatedLine && (rowNumber in modRows) === false) {
					// 新旧で差異が無い行
					idList = [`row-${rowNumber}`];
				} else {
					idList = [`original-row-${rowNumber}`, `translated-row-${rowNumber}`];
				}
				idList.forEach((id, index) => {
					let line = lineList[index];
					if (index && (rowNumber in modRows)) {
						// translated-text 現代語訳の時かつ、該当行の変更がされている場合は、
						// 変更文の内容で書き換える
						line = modRows[rowNumber];
					}
					// ［＃...は中見出し］ の 注釈を削除
					let headingLine = line.replace(/［＃[^］]*は中見出し］/g, '');
					if (line !== headingLine) {
						// 見出し
						const headingElement = document.createElement('h2');
						headingElement.id = id;
						if (idList.length >= 2) {
							if (index === 0) {
								headingElement.classList.add('original-text');
							} else {
								headingElement.classList.add('translated-text');
								headingElement.dataset.originalTarget = `original-row-${rowNumber}`;
							}
						}
						if (index && bookmarkRows.includes(rowNumber)) {
							headingElement.classList.add('bookmark');
						}
						const indentInfo = extractIndentInfo(headingLine);
						if (indentInfo) {
							headingElement.style.textIndent = `${indentInfo.number}em`;
							headingLine = indentInfo.cleanedLine;
						}
						// ルビ指定をHTMLの<ruby>に変換する
						headingLine = convertRubyToHtml(headingLine);
						// <h2>タグを<main>に投入する
						headingElement.innerHTML = headingLine;
						currentElement.appendChild(headingElement);
					} else {
						// 文
						const pElement = document.createElement('p');
						pElement.id = id;
						if (idList.length >= 2) {
							if (index === 0) {
								pElement.classList.add('original-text');
							} else {
								pElement.classList.add('translated-text');
								pElement.dataset.originalTarget = `original-row-${rowNumber}`;
							}
						}
						if (index && bookmarkRows.includes(rowNumber)) {
							pElement.classList.add('bookmark');
						}
						const indentInfo = extractIndentInfo(line);
						if (indentInfo) {
							pElement.style.textIndent = `${indentInfo.number}em`;
							line = indentInfo.cleanedLine;
						}
						// ルビ指定をHTMLの<ruby>に変換する かつ、 URLをリンクにする
						line = convertUrlsToLinks(convertRubyToHtml(line));
						// <p>タグを<main>に投入する
						pElement.innerHTML = line;
						currentElement.appendChild(pElement);
					}
				});
			}
		}

		const dlElement = document.createElement('dl');
		const fotterDcs = {
			'DC.Rights': '権利',
			'DC.Contributor': '訳者（機械翻訳による）',
			'DC.Description': '説明',
			'DC.Date': '最終更新日',
			'DC.Relation': '関係資料'
		};

		footerElement.appendChild(document.createElement('br'));

		for (const [key, value] of Object.entries(fotterDcs)) {
			const dtElement = document.createElement('dt');
			const ddElement = document.createElement('dd');
			dtElement.id = key + '-title';
			dtElement.innerHTML = value;
			ddElement.id = key + '-document';
			ddElement.innerHTML = convertUrlsToLinks(document.querySelector(`meta[name='${key}']`).content);
			dlElement.appendChild(dtElement);
			dlElement.appendChild(ddElement);
			footerElement.appendChild(dlElement);
		}
	});

	// 画面の状態を初期化する
	displayInitialize();

	// 現在表示されている吹き出しの要素
	let currentOpenTooltip = null;

	// その他の要素がクリックされた時のイベントリスナー追加
	document.body.addEventListener('click', (event) => {
		// ポップアップ要素のクリックは除外する
		const popupElement = event.target.closest('#customContextMenu,#bookmarkListsModal,.original-text.show');
		if (popupElement) {
			if (popupElement.classList.contains('show')) {
				// 吹き出しクリックは閉じる
				currentOpenTooltip?.classList?.remove('show');
			}
			return;
		}

		// 現代語訳された要素をタップ(クリック)された時、吹き出しに原文を表示させる処理。
		if (event.target.classList.contains('translated-text')) {
			const targetId = event.target.dataset.originalTarget;
			const tooltipContent = document.getElementById(targetId);

			if (!tooltipContent) {
				console.error(`Error: Tooltip content with ID '${targetId}' not found.`);
				return;
			}

			// すでに別の吹き出しが表示されている場合は非表示にする
			if (currentOpenTooltip && currentOpenTooltip !== tooltipContent) {
				currentOpenTooltip?.classList?.remove('show');
			}

			// 吹き出しの表示/非表示を切り替える
			if (tooltipContent.classList.contains('show')) {
				tooltipContent?.classList?.remove('show');
				currentOpenTooltip = null;
			} else {
				tooltipContent.classList.add('show');
				currentOpenTooltip = tooltipContent;

				// 吹き出しの位置を計算して設定
				positionTooltip(event.target, tooltipContent);

				// メニューを閉じる
				if (customContextMenuElement.style.display === 'block') {
					customContextMenuElement.style.display = 'none';
					currentTargetElement = null;
				}
			}
		} else {
			// 吹き出し外をクリックしたら非表示にする
			if (currentOpenTooltip) {
				currentOpenTooltip?.classList?.remove('show');
				currentOpenTooltip = null;
			}
		}

		// ブックマーク要素がクリックされた時の処理
		const taragetBookmarkElement = event.target.closest('.bookmark');
		if (taragetBookmarkElement) {
			// 親要素の左端の座標範囲を計算
			const pseudoElementScreenLeft = taragetBookmarkElement.getBoundingClientRect().left;
			// クリック座標が親要素の左側にあるか判定
			if (
				event.clientX <= pseudoElementScreenLeft
			) {
				// ::before 要素クリック時はブックマークを解除する。
				taragetBookmarkElement.classList.remove('bookmark');
				// 'bookmark'クラスの操作の後、ブックマーク行番号を取得して更新する
				bookmarkRows = getBookmarkRows();
				// ブックマークリストをローカルストレージに保存する
				localStorage.setItem(`aozoraModernJapaneseTranslation_BookmarkRows_${addFilename}`, bookmarkRows.join(','));
			}
		}

		// クリックされた場所がメニュー内ではない、かつメニューが表示されている場合、メニューを非表示にする
		if (customContextMenuElement.style.display === 'block' && !(customContextMenuElement.contains(event.target))) {
			customContextMenuElement.style.display = 'none';
			currentTargetElement = null;
		} else {
			// カスタムコンテキストメニューを表示する
			customContextMenu(event);
		}
	});

	// contextmenu イベントリスナー追加 (右クリック/長押し)
	document.body.addEventListener('contextmenu', (event) => {
		customContextMenuElement.style.display = 'none';
		currentTargetElement = null;
	});

	// リサイズ時にも吹き出しの位置を調整 (すでに表示されている場合)
	window.addEventListener('resize', () => {
		if (currentOpenTooltip) {
			const triggerId = currentOpenTooltip.id;
			const correspondingTrigger = document.querySelector(`[data-original-target='${triggerId}']`);
			if (correspondingTrigger) {
				positionTooltip(correspondingTrigger, currentOpenTooltip);
			}
		}
	});

	// feature-content.html の読み込み完了を待機
	await loadFeatureContent;
	// コンテキストメニュー要素の取得
	customContextMenuElement = document.getElementById('customContextMenu');
	// ブックマークモーダルウィンドウの取得
	bookmarkListsModalElement = document.getElementById('bookmarkListsModal');
	// 本文変更モーダルウィンドウの取得
	editSentenceModalElement = document.getElementById('editSentenceModal');
	// 汎用メッセージボックスモーダルウィンドウの取得
	commonMessageBoxModalElement = document.getElementById('commonMessageBoxModal');
	// 編集内容のファイル読み込みボタンの取得
	editDataJsonFileInputElement = document.getElementById('editDataJsonFileInput');
	/** コンテキストメニューのターゲット要素 */
	let currentTargetElement = null;
	/** コンテキストメニューのターゲット行番号 */
	let currentTargetRowNumber = 0;
	/** コンテキストメニューキーが押されているか */
	let isTriggeredByKeyboardContextMenuKey = false;

	/** カスタムコンテキストメニューの表示展開 */
	const customContextMenu = (event) => {
		let clientX, clientY;
		let target = event.target;

		// コンテキストメニューキーが押されているか
		if (isTriggeredByKeyboardContextMenuKey) {
			// コンテキストメニューキーが押されている場合、
			// マウス位置をグローバル変数から取得する
			clientX = mousePosition.x;
			clientY = mousePosition.y;
			// 要素もマウス位置を基準に取得する
			target = document.elementFromPoint(mousePosition.x, mousePosition.y);
			isTriggeredByKeyboardContextMenuKey = false;
		} else {
			// コンテキストメニューキーが押されていない（右クリックやタップの）場合、
			// マウス位置をイベント変数から取得する
			clientX = event.clientX;
			clientY = event.clientY;
		}

		// 既存のメニューが表示されていれば非表示にする
		if (customContextMenuElement.style.display === 'block') {
			customContextMenuElement.style.display = 'none';
		}

		// メニューを表示する
		customContextMenuElement.style.display = 'block';

		// コンテキストメニューのターゲット行番号を記録
		currentTargetRowNumber = getRowNumberFromElementId(target.id);

		/** ブックマークボタン */
		const listItemBookmarkSetUnSetElement = customContextMenuElement.querySelector('li[data-action="bookmark-set-un-set"]');
		/** 本文編集ボタン */
		const listItemEditSentenceElement = customContextMenuElement.querySelector('li[data-action="edit-sentence"]');

		// メニュー項目(アイテム)の表示/非表示切り替え
		if (currentTargetRowNumber) {
			// Main > 本文 の 要素であればブックマークボタンを表示する。
			listItemBookmarkSetUnSetElement.style.display = 'block';
			if (target.classList.contains('bookmark')) {
				// ブックマーク済みの時は、青色ブックマークを表示する
				listItemBookmarkSetUnSetElement.querySelector('img').src = './img/bookmark-blue.svg';
			} else {
				// ブックマークしていない時は、黒色ブックマークを表示する
				listItemBookmarkSetUnSetElement.querySelector('img').src = './img/bookmark.svg';
			}
			// Main > 本文 の 要素であれば本文編集を表示する。
			listItemEditSentenceElement.style.display = 'block';
		} else {
			// Main > 本文 の 要素で無ければブックマークボタンを非表示にする。
			listItemBookmarkSetUnSetElement.style.display = 'none';
			// Main > 本文 の 要素で無ければ本文編集を非表示にする。
			listItemEditSentenceElement.style.display = 'none';
		}

		// 文字サイズ
		const fontSizePx = parseFloat(window.getComputedStyle(customContextMenuElement).fontSize);

		// メニューの位置を設定
		// スクロール位置を考慮してドキュメント基準のY座標を計算
		// window.scrollY は現在のドキュメントの垂直方向のスクロール量
		let posX = clientX + window.scrollX - fontSizePx * 2;
		let posY = clientY + window.scrollY + fontSizePx;

		// 画面の端からはみ出さないように調整
		const menuWidth = customContextMenuElement.offsetWidth;
		const menuHeight = customContextMenuElement.offsetHeight;
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;

		// スクロールバーを含まないビューポートの右端・下端を基準に調整する
		// clientX/Yはスクロールの影響を受けないので、調整ロジックもそのままclient*を使用
		if (clientX + menuWidth > viewportWidth) {
			posX = viewportWidth - menuWidth - 5 + window.scrollX;
		}
		if (clientY + menuHeight > viewportHeight) {
			posY = viewportHeight - menuHeight - 5 + window.scrollY;
		}

		// 画面左端・上端からはみ出し防止
		if (posX < window.scrollX) posX = window.scrollX;
		if (posY < window.scrollY) posY = window.scrollY;

		customContextMenuElement.style.left = `${posX}px`;
		customContextMenuElement.style.top = `${posY}px`;

		// 現在メニューが表示されているターゲットを記録
		currentTargetElement = target;
	}

	// メニュー項目がクリックされた時の処理
	customContextMenuElement.addEventListener('click', async (event) => {
		const action = event.target.closest('li[data-action]').dataset.action;
		if (action) {
			if (action === 'bookmark-set-un-set') {
				if (currentTargetElement.classList.contains('bookmark')) {
					currentTargetElement.classList.remove('bookmark');
				} else {
					currentTargetElement.classList.add('bookmark');
				}
				// 'bookmark'クラスの操作の後、ブックマーク行番号を取得して更新する
				bookmarkRows = getBookmarkRows();
				// ブックマークリストをローカルストレージに保存する
				localStorage.setItem(`aozoraModernJapaneseTranslation_BookmarkRows_${addFilename}`, bookmarkRows.join(','));
			} else if (action === 'bookmark-list-open') {
				// ブックマークリスト表示
				popupBookmarkListsModal();
				// メニューは閉じない
				return;
			} else if (action === 'edit-sentence') {
				if (currentTargetRowNumber) {
					// 行クリック時、本文変更モーダルウィンドウの表示をする
					editSentenceModal();
				}
				// メニューは閉じない
				return;
			} else if (action === 'modified-list-load-or-save') {
				// メッセージボックスを表示する
				await commonMessageBoxModal('', '編集内容ファイルの保存/読み込み', [
					{
						html: '保存する', callback: () => {
							// editData.jsonダウンロード
							saveJson("editData.json", JSON.stringify(modRows, null, 1))
						}
					},	// 編集内容のファイル読み込みボタンのクリックイベントを実行してファイル読み込みする
					{ html: '読み込み', callback: () => editDataJsonFileInputElement.click() },
					{
						html: '初期状態に戻す', callback: () => {
							if (window.confirm('初期状態に戻すと変更内容が消えます。\n先に保存してから戻す事をお勧めします。')) {
								localStorage.removeItem(`aozoraModernJapaneseTranslation_ModRows_${addFilename}`);
								modRows = {};
								// 画面の状態を初期化する
								displayInitialize();
							}
						}
					},
				]);
				// メニューは閉じない
				return;
			} else if (action === 'share-to-twitter') {
				// ページ遷移はボタンに直接クリックイベントを割り当てて対応
				// メニューは閉じない
				return;
			} else if (action === 'change-font-size') {
				// フォントサイズを変更する
				changeFontSize();
				// スクロールが狂うためクリックした位置にジャンプする
				jumpToId(currentTargetElement.id);
				// メニューは閉じない
				return;
			} else if (action === 'close') {
				// 明示的に閉じるボタンが押された場合
			} else {
				// 設定されていないボタンが押された場合
			}
		}
		// クリック後にメニューを非表示
		customContextMenuElement.style.display = 'none';
		currentTargetElement = null;
	});

	// Twitterへ共有するボタンが押下された時のイベントリスナー追加
	document.getElementById('shareToTwitter').addEventListener('click', () => {
		const anker = currentTargetElement.id ? '#' + currentTargetElement.id : '';
		const pageUrl = encodeURIComponent(window.location.origin + window.location.pathname + anker);

		let pageText = document.querySelector('title').innerHTML;
		let rowNumber = getRowNumberFromElementId(currentTargetElement.id);
		if (rowNumber) {
			pageText += ` を ${(rowNumber / mainRowCount * 100).toFixed(1)}% まで読みました。`;
		} else {
			pageText += ` を読みました。`;
		}
		pageText = encodeURIComponent(pageText);
		const shareUrl = `https://twitter.com/intent/tweet?url=${pageUrl}&text=${pageText}`;

		window.open(shareUrl, '_blank', 'noopener,noreferrer');
	});

	// キーボード押下時のイベントリスナー追加
	document.addEventListener('keydown', (event) => {
		// Escapeキー押下で開いているものを閉じる
		if (event.key === 'Escape') {
			// メニューを非表示
			if (customContextMenuElement.style.display === 'block') {
				customContextMenuElement.style.display = 'none';
				currentTargetElement = null;
			}
			currentOpenTooltip?.classList?.remove('show');
			currentOpenTooltip = null;
			// モーダルを閉じる
			closeToBookmarkListsModal();
		} else if (event.altKey && (event.key === 'b' || event.key === 'B')) {
			// alt + b 		... 一覧表示 (next)
			// 次のブックマークにジャンプ
			nextBookmarkJump();
			// ブックマークリスト表示
			popupBookmarkListsModal();
		} else if (event.shiftKey && (event.key === 'b' || event.key === 'B')) {
			// shift + b 	... 一覧表示 (prev)
			// 前のブックマークにジャンプ
			nextBookmarkJump(true);
			// ブックマークリスト表示
			popupBookmarkListsModal();
		} else if (event.key === 'b') {
			// b 			... ブックマーク on/off
			// その座標にある最上位の要素を取得
			const underCursorElement = document.elementFromPoint(mainElement.getBoundingClientRect().left, mousePosition.y);
			if (underCursorElement && underCursorElement.closest('main') && underCursorElement.id.indexOf('row-') !== -1) {
				// 本文の文書の要素取得時のみ処理する
				if (underCursorElement.classList.contains('bookmark')) {
					underCursorElement.classList.remove('bookmark');
				} else {
					underCursorElement.classList.add('bookmark');
				}
				// 'bookmark'クラスの操作の後、ブックマーク行番号を取得して更新する
				bookmarkRows = getBookmarkRows();
				// ブックマークリストをローカルストレージに保存する
				localStorage.setItem(`aozoraModernJapaneseTranslation_BookmarkRows_${addFilename}`, bookmarkRows.join(','));
			}
		} else if (event.key === 'ContextMenu') {
			isTriggeredByKeyboardContextMenuKey = true;
		}
	});

	/** 次のブックマークへジャンプする */
	let bookmarkRowsIndex = -1;
	const nextBookmarkJump = (isPrev = false) => {
		if (bookmarkRows.length >= 2) {
			if (!(bookmarkListsModalElement) || bookmarkListsModalElement.style.display === 'none') {
				// ブックマークモーダルウィンドウ非表示の時はマウス位置を基準に前後のブックマーク位置に移動する
				const underCursorElement = document.elementFromPoint(mainElement.getBoundingClientRect().left, mousePosition.y);
				if (underCursorElement && underCursorElement.closest('main') && underCursorElement.id.indexOf('row-') !== -1) {
					const currentRowNumber = getRowNumberFromElementId(underCursorElement.id);
					for (const [index, rowNumber] of bookmarkRows.entries()) {
						if (currentRowNumber === rowNumber) {
							jumpToRowNumber(rowNumber);
							bookmarkRowsIndex = index;
							break;
						} else if (currentRowNumber <= rowNumber) {
							bookmarkRowsIndex = index;
							if (isPrev) {
								// 前のブックマークにジャンプ (アンダーフローした場合末尾のブックマークにジャンプする)
								jumpToRowNumber(bookmarkRows.at(--bookmarkRowsIndex));
							} else {
								// 次のブックマークにジャンプ
								jumpToRowNumber(rowNumber);
							}
							break;
						}
					}
				} else {
					if (isPrev) {
						// 末尾のブックマークにジャンプする
						jumpToRowNumber(bookmarkRows.at(-1));
						bookmarkRowsIndex = bookmarkRows.length - 1;
					} else {
						// 先頭のブックマークにジャンプ
						jumpToRowNumber(bookmarkRows.at(0));
						bookmarkRowsIndex = 0;
					}
				}
			} else {
				if (bookmarkRowsIndex === -1) { bookmarkRowsIndex = 0; }
				// ブックマークモーダルウィンドウ表示している時は、前回のブックマークから前後のブックマーク位置に移動する
				if (isPrev) {
					// 前のブックマークにジャンプ (アンダーフローした場合末尾のブックマークにジャンプする)
					if (--bookmarkRowsIndex < 0) {
						bookmarkRowsIndex = bookmarkRows.length + bookmarkRowsIndex;
					}
				} else {
					// 次のブックマークにジャンプ
					if (++bookmarkRowsIndex > bookmarkRows.length - 1) {
						bookmarkRowsIndex = bookmarkRowsIndex - bookmarkRows.length;
					}
				}
				jumpToRowNumber(bookmarkRows.at(bookmarkRowsIndex));
			}
		} else if (bookmarkRows.length === 1) {
			jumpToRowNumber(bookmarkRows[0]);
		}
	}

	/** 指定行番号にジャンプする */
	const jumpToRowNumber = (rowNumber) => {
		const targetRow = document.getElementById(`translated-row-${rowNumber}`) ?? document.getElementById(`row-${rowNumber}`);
		if (targetRow) { jumpToId(targetRow.id); }
	}

	/** 指定ID位置にジャンプする */
	const jumpToId = (id) => {
		const anker = id ? '#' + id : '';
		window.location.href = window.location.pathname + anker;
	}

	/** マウスカーソルの座標 */
	const mousePosition = { x: 0, y: 0 };

	// mousemove イベントリスナー追加に追加
	document.addEventListener('mousemove', (event) => {
		// 常にマウスカーソルの位置を更新する
		mousePosition.x = event.clientX;
		mousePosition.y = event.clientY;
	});

	/** ブックマークモーダルウィンドウ閉じるボタン */
	const bookmarkListsModalCloseButton = bookmarkListsModalElement.querySelector('.close-button');
	/** ブックマークモーダルウィンドウ閉じるボタン */
	const editSentenceModalCloseButton = editSentenceModalElement.querySelector('.close-button');
	/** 汎用メッセージボックスモーダル閉じるボタン */
	const commonMessageBoxModalCloseButton = commonMessageBoxModalElement.querySelector('.close-button');
	/** ブックマークリスト表示欄 */
	const bookmarkList = document.getElementById('bookmarkList');
	/** 目次リスト表示欄 */
	const indexList = document.getElementById('indexList');

	/** ブックマークが無い時に表示する用リストアイテム */
	const noBookmarkLi = document.createElement('li');
	noBookmarkLi.textContent = 'ブックマークがありません。';
	noBookmarkLi.style.cursor = 'default';
	noBookmarkLi.style.textAlign = 'center';
	noBookmarkLi.style.color = '#777';
	noBookmarkLi.style.backgroundColor = 'transparent';

	/** 目次が無い時に表示する用リストアイテム */
	const noIndexLi = noBookmarkLi.cloneNode(false);
	noIndexLi.textContent = '参照できる章がありません。';

	/** ブックマークモーダルウィンドウの表示をする */
	const popupBookmarkListsModal = () => {
		// ブックマークモーダルウィンドウの表示
		bookmarkListsModalElement.style.display = 'flex';

		/** 項目がクリックされた時、該当位置にジャンプする */
		const clickFunction = (id) => {
			// ブックマーク位置に移動
			jumpToId(id);
			// モーダルを閉じる
			closeToBookmarkListsModal();
			// メニューを非表示
			if (customContextMenuElement.style.display === 'block') {
				customContextMenuElement.style.display = 'none';
				currentTargetElement = null;
			}
			currentOpenTooltip?.classList?.remove('show');
			currentOpenTooltip = null;
		}

		// ブックマークリストをクリア
		bookmarkList.innerHTML = '';
		if (bookmarkRows.length) {
			// ブックマークリストを画面に表示する
			bookmarkRows.forEach((rowNumber, index) => {
				const listItem = document.createElement('li');
				const targetRow = document.getElementById(`translated-row-${rowNumber}`) ?? document.getElementById(`row-${rowNumber}`);
				if (targetRow) {
					listItem.innerHTML = `${rowNumber} : ${targetRow.innerText}`;
					if (index === bookmarkRowsIndex) {
						listItem.classList.add('primary');
					}
					bookmarkList.appendChild(listItem);

					// リスト項目がクリックされた時の処理
					listItem.addEventListener('click', () => {
						clickFunction(targetRow.id);
					});
				}
			});
		} else {
			// ブックマークが無い時用の表示をする
			bookmarkList.appendChild(noBookmarkLi);
		}

		// 目次リストをクリア
		indexList.innerHTML = '';
		const indexRowElements = document.querySelectorAll('main h2:not(.original-text)');
		if (indexRowElements.length) {
			// 目次リストを画面に表示する
			indexRowElements.forEach(targetElement => {
				const listItem = document.createElement('li');
				if (targetElement) {
					listItem.innerHTML = `${targetElement.innerHTML}`;
					indexList.appendChild(listItem);

					// リスト項目がクリックされた時の処理
					listItem.addEventListener('click', () => {
						clickFunction(targetElement.id);
					});
				}
			});
		} else {
			// 目次が無い時用の表示をする
			indexList.appendChild(noIndexLi);
		}
	}

	/** ブックマークモーダルウィンドウを閉じる */
	const closeToBookmarkListsModal = () => {
		bookmarkListsModalElement.style.display = 'none';
	}

	// 閉じるボタンイベントリスナー追加
	bookmarkListsModalCloseButton.addEventListener('click', closeToBookmarkListsModal);

	// モーダルコンテンツ以外をクリックした時、モーダルウィンドウを閉じる
	bookmarkListsModalElement.addEventListener('click', (event) => {
		if (event.target === bookmarkListsModalElement) {
			closeToBookmarkListsModal();
		}
	});

	/** 本文変更モーダルウィンドウの表示をする */
	const editSentenceModal = () => {
		// 本文変更モーダルウィンドウの表示
		editSentenceModalElement.style.display = 'flex';
		if (currentTargetRowNumber in modRows) {
			// 該当行の変更がされている場合は、変更文を表示する
			editSentenceAreaElement.innerText = modRows[currentTargetRowNumber];
		} else {
			editSentenceAreaElement.innerText = mainTranslatedLines[currentTargetRowNumber - 1];
		}
	}

	/** 本文変更モーダルウィンドウを閉じる */
	const closeToEditSentenceModal = () => {
		editSentenceModalElement.style.display = 'none';
		/** 編集されたテキスト */
		let editTextTemp = editSentenceAreaElement.innerText.replace(/［＃[^］]*は中見出し］/g, '');
		/** 編集される前のテキスト */
		let beforeText;
		if (currentTargetRowNumber in modRows) {
			// 該当行の変更がされている場合は、変更文を表示する
			beforeText = modRows[currentTargetRowNumber];
		} else {
			beforeText = mainTranslatedLines[currentTargetRowNumber - 1];
		}
		// 該当行の変更がされている場合は、変更内容を適応して記録する
		if (beforeText !== editTextTemp) {
			const indentInfo = extractIndentInfo(editTextTemp);
			if (indentInfo) {
				currentTargetElement.style.textIndent = `${indentInfo.number}em`;
				editTextTemp = indentInfo.cleanedLine;
			}
			const editHTML = convertUrlsToLinks(convertRubyToHtml(editTextTemp));

			if (currentTargetElement.classList.contains('translated-text') === false) {
				// IDパターン : `row-${rowNumber}` の時、
				// IDパターン : `original-row-${rowNumber}`, `translated-row-${rowNumber}`} の形式に変更する。
				// translatedElement
				currentTargetElement.id = `translated-row-${currentTargetRowNumber}`;
				currentTargetElement.classList.add('translated-text');
				currentTargetElement.dataset.originalTarget = `original-row-${currentTargetRowNumber}`;

				// originalParagraphElement (吹き出し要素)
				const originalParagraphElement = document.createElement('p');
				let originalHTML = mainOriginalLines[currentTargetRowNumber - 1].replace(/［＃[^］]*は中見出し］/g, '');
				const indentInfoOriginal = extractIndentInfo(originalHTML);
				if (indentInfoOriginal) {
					currentTargetElement.style.textIndent = `${indentInfoOriginal.number}em`;
					originalHTML = indentInfoOriginal.cleanedLine;
				}
				originalHTML = convertUrlsToLinks(convertRubyToHtml(originalHTML));
				originalParagraphElement.id = `original-row-${currentTargetRowNumber}`;
				originalParagraphElement.className = `original-text`;
				originalParagraphElement.innerHTML = originalHTML;
				mainElement.insertBefore(originalParagraphElement, currentTargetElement);
			}
			if (mainTranslatedLines[currentTargetRowNumber - 1] === editSentenceAreaElement.innerText) {
				// 変更点がなくなった時は、連想配列から変更内容を削除する
				delete modRows[currentTargetRowNumber];
			} else {
				// 変更行の連想配列に変更内容を追加する
				modRows[currentTargetRowNumber] = editSentenceAreaElement.innerText;
			}
			// 画面に変更を反映する
			currentTargetElement.innerHTML = editHTML;
			// ローカルストレージ変更内容を記録する
			localStorage.setItem(`aozoraModernJapaneseTranslation_ModRows_${addFilename}`, JSON.stringify(modRows));
		}
	}

	/** 本文変更テキストエリア */
	const editSentenceAreaElement = document.getElementById('editSentenceArea');
	/** 原文に戻すボタン */
	const rollbackToOriginalButton = document.getElementById('rollbackToOriginal');
	/** 現代語訳に戻すボタン */
	const rollbackToTranslatedButton = document.getElementById('rollbackToTranslated');
	/** 閉じるボタン */
	const editSentenceModalCloseButton2 = document.getElementById('editSentenceModalClose');

	// 原文に戻すボタンのイベントリスナー追加
	rollbackToOriginalButton.addEventListener('click', () => {
		editSentenceAreaElement.innerText = mainOriginalLines[currentTargetRowNumber - 1];
	});
	// 現代語訳に戻すボタンのイベントリスナー追加
	rollbackToTranslatedButton.addEventListener('click', () => {
		editSentenceAreaElement.innerText = mainTranslatedLines[currentTargetRowNumber - 1];
	});
	// ✕ボタンのイベントリスナー追加
	editSentenceModalCloseButton.addEventListener('click', closeToEditSentenceModal);
	// 閉じるボタンのイベントリスナー追加
	editSentenceModalCloseButton2.addEventListener('click', closeToEditSentenceModal);

	// モーダルコンテンツ以外をクリックした時、モーダルウィンドウを閉じる
	editSentenceModalElement.addEventListener('click', (event) => {
		event.stopPropagation();
		if (event.target === editSentenceModalElement) {
			closeToEditSentenceModal();
		}
	});

	/** 汎用メッセージボックスモーダルウィンドウの表示をする */
	const commonMessageBoxModal = (messageHTML = null, headingHTML = null, buttonList = null) => {
		const messageAreaElement = commonMessageBoxModalElement.querySelector('.border-block');
		if (messageHTML) {
			messageAreaElement.innerHTML = messageHTML;
		} else {
			messageAreaElement.style.display = 'none';
		}
		const headingElement = commonMessageBoxModalElement.querySelector('h2');
		if (headingHTML) {
			headingElement.innerHTML = headingHTML;
		} else {
			headingElement.innerHTML = 'メッセージ';
		}
		const buttonsBarElement = commonMessageBoxModalElement.querySelector('.buttons-bar');
		buttonsBarElement.innerHTML = '';

		// 汎用メッセージボックスモーダルウィンドウの表示
		commonMessageBoxModalElement.style.display = 'flex';

		// Promiseを返す
		return new Promise((resolve) => {
			/** 汎用メッセージボックスモーダルウィンドウを閉じる */
			const closeToCommonMessageBoxModal = () => {
				commonMessageBoxModalElement.style.display = 'none';
				resolve(0);
			}
			if (buttonList) {
				// ボタンリストがある場合は、各ボタンとコールバック関数を登録する
				buttonList.forEach((buttonItem, index) => {
					const id = index + 1;
					const buttonElement = document.createElement('button');
					buttonElement.id = `MsgBoxButton_${id}`;
					buttonElement.innerHTML = buttonItem.html;
					buttonElement.addEventListener('click', () => {
						buttonItem.callback();
						resolve(id);
					});
					buttonsBarElement.appendChild(buttonElement);
				});
			} else {
				// ボタンリストがある場合は、各ボタンとコールバック関数を登録する
				const buttonElement = document.createElement('button');
				buttonElement.id = `MsgBoxButton_${1}`;
				buttonElement.innerHTML = '閉じる';
				buttonElement.addEventListener('click', closeToCommonMessageBoxModal);
				buttonsBarElement.appendChild(buttonElement);
			}

			// ✕ボタンのイベントリスナー追加
			commonMessageBoxModalCloseButton.addEventListener('click', closeToCommonMessageBoxModal);

			// モーダルコンテンツ以外をクリックした時、モーダルウィンドウを閉じる
			commonMessageBoxModalElement.addEventListener('click', (event) => {
				event.stopPropagation();
				if (event.target === commonMessageBoxModalElement) {
					closeToCommonMessageBoxModal();
				}
			});
		});
	}

	/** フォントサイズを変更する */
	const changeFontSize = () => {
		let before = Number(localStorage.getItem(`aozoraModernJapaneseTranslation_FontSize_${addFilename}`) || 3);
		let after = before + 1;
		if (after > 5) { after = 1; }
		document.body.classList.remove(`size${before}`);
		document.body.classList.add(`size${after}`);
		localStorage.setItem(`aozoraModernJapaneseTranslation_FontSize_${addFilename}`, after);
	}

	// 編集内容のファイル読み込みボタンをクリックしてファイルが読み込まれた時のイベントリスナー追加
	editDataJsonFileInputElement.addEventListener('change', (event) => {
		if (event.target.files.length >= 2) {
			// 本来通らない処理だが、安全策として用意している。
			alert('ファイルが複数選択されています。');
			return;
		}
		const selectedFile = event.target.files[0];
		if (selectedFile) {
			console.log('選択されたファイル名:', selectedFile.name);

			const reader = new FileReader();
			// onloadイベントハンドラ
			reader.onload = (e) => {
				try {
					modRows = JSON.parse(e.target.result);
					localStorage.setItem(`aozoraModernJapaneseTranslation_ModRows_${addFilename}`, e.target.result);
					// 画面の状態を初期化する
					displayInitialize();
				} catch (error) {
					// JSONパース中にエラーが発生した場合
					console.error('JSONファイルのパース中にエラーが発生しました:', error);
					alert('編集内容のファイルが有効なファイルではありません。');
				}
			};
			// ファイルの読み込み中にエラーが発生したときのイベントハンドラ
			reader.onerror = (e) => {
				console.error('ファイルの読み込み中にエラーが発生しました:', e.target.error);
				alert('ファイルの読み込み中にエラーが発生しました。');
			};

			// ファイルの読み込み開始、onloadイベントの発火
			reader.readAsText(selectedFile);
		} else {
			alert('ファイルが選択されていません。');
		}
	});
});