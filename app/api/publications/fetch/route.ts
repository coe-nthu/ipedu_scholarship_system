import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  // 1. 從前端傳來的 URL 中取得 DOI 參數
  const { searchParams } = new URL(request.url);
  const doi = searchParams.get('doi');

  if (!doi) {
    return NextResponse.json(
      { success: false, error: '缺少 DOI 參數' },
      { status: 400 }
    );
  }

  try {
    // 2. 呼叫 Crossref 官方 API
    // 💡 建議：把 mailto 改成你的清大信箱，這會讓你進入 Crossref 的「禮貌連線池 (Polite Pool)」，速度更快且不易被擋！
    const crossrefUrl = `https://api.crossref.org/works/${encodeURIComponent(doi)}?mailto=your-email@nthu.edu.tw`;
    const response = await fetch(crossrefUrl);

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { success: false, error: '在 Crossref 找不到此 DOI，請確認輸入是否正確。' },
          { status: 404 }
        );
      }
      throw new Error('Crossref API 連線異常');
    }

    const json = await response.json();
    const data = json.message;

    // 3. 資料清洗與格式化 (Data Parsing)
    
    // 處理日期：尋找最早的發布日期，並格式化為 YYYY-MM-DD
    const dateParts = 
      data['published-print']?.['date-parts']?.[0] || 
      data['published-online']?.['date-parts']?.[0] || 
      data['created']?.['date-parts']?.[0] || 
      [];
    const publishDate = dateParts.length > 0 
      ? `${dateParts[0]}-${String(dateParts[1] || 1).padStart(2, '0')}-${String(dateParts[2] || 1).padStart(2, '0')}`
      : '';

    // 處理作者群
        const authorsRaw = data.author || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authors = authorsRaw.map((author: any) => ({
      given: author.given || '',
      family: author.family || '',
      sequence: author.sequence || 'additional'
    }));

    // 組合前端顯示用的作者字串 (例如: "Brown, T., Mann, B. et al.")
    let authorString = '';
    if (authors.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const formattedNames = authors.slice(0, 3).map((a: any) => {
        const initial = a.given ? `${a.given.charAt(0)}.` : '';
        return `${a.family}, ${initial}`.trim();
      });
      authorString = formattedNames.join(', ');
      if (authors.length > 3) {
        authorString += ' et al.';
      }
    }

    // 組合卷期號
    const volume = data.volume ? `Vol. ${data.volume}` : '';
    const issue = data.issue ? `Issue ${data.issue}` : '';
    const volumeIssue = [volume, issue].filter(Boolean).join(', ');

    // 4. 回傳乾淨的 JSON 給前端
    return NextResponse.json({
      success: true,
      data: {
        doi: data.DOI,
        title: data.title?.[0] || '未提供標題',
        journalName: data['container-title']?.[0] || '未提供期刊名稱',
        publishDate,
        volumeIssue,
        issns: data.ISSN || [],
        authors,
        authorString,
        publisher: data.publisher || ''
      }
    });

  } catch (error) {
    console.error('Fetch Publication Error:', error);
    return NextResponse.json(
      { success: false, error: '伺服器處理時發生錯誤，請稍後再試。' },
      { status: 500 }
    );
  }
}
