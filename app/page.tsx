"use client"; // 告訴 Next.js 這是一個需要在瀏覽器端執行的互動元件

import { useState } from "react";

export default function ScholarshipForm() {
  // 1. 使用 React 的 useState 來管理動態陣列 (取代原本的 addRow JS)
  const [journals, setJournals] = useState([
    { doi: "", date: "", author: "", title: "", journal: "", database: "" },
  ]);

  // 新增一列期刊的函式
  const addJournal = () => {
    setJournals([...journals, { doi: "", date: "", author: "", title: "", journal: "", database: "" }]);
  };

  // 更新特定欄位資料的函式
  const handleJournalChange = (index: number, field: string, value: string) => {
    const updatedJournals = [...journals];
    updatedJournals[index] = { ...updatedJournals[index], [field]: value };
    setJournals(updatedJournals);
  };

  // 2. 實作 DOI 自動帶入邏輯 (React 寫法)
  const fetchPaperData = async (index: number) => {
    const doiValue = journals[index].doi;
    if (!doiValue) {
      alert("請先輸入 DOI 碼");
      return;
    }

    try {
      // 這裡預先串接我們規劃好的後端 API 路徑
      const response = await fetch(`/api/publications/fetch?doi=${encodeURIComponent(doiValue)}`);
      const result = await response.json();

      if (result.success) {
        // 將抓到的資料寫入對應的 state 中，畫面就會自動更新！
        const updatedJournals = [...journals];
        updatedJournals[index].title = result.data.title;
        updatedJournals[index].journal = `${result.data.journalName} (${result.data.volumeIssue})`;
        updatedJournals[index].date = result.data.publishDate;
        updatedJournals[index].author = result.data.authorString;
        setJournals(updatedJournals);
      } else {
        alert(result.error || "找不到資料");
      }
    } catch (error) {
      alert("連線發生錯誤，請稍後再試。");
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 bg-gray-50 min-h-screen font-sans">
      <h1 className="text-3xl font-bold text-center text-[#1a3a5f] mb-8">
        竹師教育學院博士生獎學金學術表現表
      </h1>

      <form className="space-y-6">
        {/* 基本資料區塊 */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <div className="grid grid-cols-2 gap-6 mb-4">
            <div>
              <label className="block text-gray-700 font-medium mb-2">申請人姓名</label>
              <input type="text" className="w-full p-2 border border-gray-300 rounded focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-gray-700 font-medium mb-2">所屬學系所</label>
              <input type="text" className="w-full p-2 border border-gray-300 rounded focus:border-blue-500 focus:outline-none" />
            </div>
          </div>
        </div>

        {/* 期刊發表區塊 */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h2 className="text-lg font-bold text-gray-800 border-l-4 border-blue-500 pl-3 mb-4 bg-gray-50 py-1">
            一、期刊發表
          </h2>
          
          <div className="overflow-x-auto">
            <table className="w-full border-collapse mb-4 min-w-[800px]">
              <thead>
                <tr className="bg-gray-100 text-gray-700">
                  <th className="border p-2 text-left w-48">DOI 自動帶入</th>
                  <th className="border p-2 text-left w-36">發表日期</th>
                  <th className="border p-2 text-left w-36">作者/順位</th>
                  <th className="border p-2 text-left">期刊∕論文名稱</th>
                  <th className="border p-2 text-left w-32">資料庫</th>
                </tr>
              </thead>
              <tbody>
                {/* 3. 使用 map 動態渲染陣列內容 */}
                {journals.map((journal, index) => (
                  <tr key={index}>
                    <td className="border p-2">
                      <div className="flex flex-col gap-2">
                        <input
                          type="text"
                          placeholder="10.10xx/..."
                          className="w-full p-1 border rounded"
                          value={journal.doi}
                          onChange={(e) => handleJournalChange(index, "doi", e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => fetchPaperData(index)}
                          className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-sm hover:bg-blue-200 transition"
                        >
                          自動帶入
                        </button>
                      </div>
                    </td>
                    <td className="border p-2">
                      <input type="date" className="w-full p-1 border rounded" value={journal.date} onChange={(e) => handleJournalChange(index, "date", e.target.value)} />
                    </td>
                    <td className="border p-2">
                      <input type="text" className="w-full p-1 border rounded" placeholder="第一/通訊" value={journal.author} onChange={(e) => handleJournalChange(index, "author", e.target.value)} />
                    </td>
                    <td className="border p-2">
                      <div className="flex flex-col gap-2">
                        <input type="text" className="w-full p-1 border rounded font-medium" placeholder="論文名稱" value={journal.title} onChange={(e) => handleJournalChange(index, "title", e.target.value)} />
                        <input type="text" className="w-full p-1 border rounded text-sm text-gray-600" placeholder="期刊名稱與期數" value={journal.journal} onChange={(e) => handleJournalChange(index, "journal", e.target.value)} />
                      </div>
                    </td>
                    <td className="border p-2">
                      <input type="text" className="w-full p-1 border rounded" placeholder="如SSCI" value={journal.database} onChange={(e) => handleJournalChange(index, "database", e.target.value)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={addJournal}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
          >
            + 新增一列期刊
          </button>
        </div>
        
        {/* 為了畫面簡潔，研討會與其他經歷區塊的邏輯與上方完全相同，你可以先試著跑起這個版本 */}
      </form>
    </div>
  );
}