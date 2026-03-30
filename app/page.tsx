"use client";

import { useState } from "react";

export default function ScholarshipForm() {
  // === 1. 狀態管理 (State Management) ===
  // 期刊發表狀態
  const [journals, setJournals] = useState([
    { doi: "", date: "", author: "", title: "", journal: "", database: "" },
  ]);

  // 國際研討會狀態
  const [conferences, setConferences] = useState([
    { date: "", author: "", title: "", conference: "", type: "口頭發表" },
  ]);

  // 研究經歷狀態
  const [experiences, setExperiences] = useState([
    { institution: "", title: "", nature: "", duration: "", hasAttachment: false },
  ]);

  // 其他純文字輸入狀態
  const [awards, setAwards] = useState("");
  const [otherAchievements, setOtherAchievements] = useState("");

  // === 2. 處理函式 (Handlers) ===
  // 新增列的函式
  const addJournal = () => {
    // 取得目前陣列的最後一筆資料
    const last = journals[journals.length - 1];
    // 檢查必填欄位是否為空 (DOI 通常非必填，故不檢查)
    if (!last.date || !last.author || !last.title || !last.journal || !last.database) {
      alert("請先將最後一列「期刊發表」的欄位填寫完整，再新增下一列！");
      return; // 終止執行，不會新增下一列
    }
    setJournals([...journals, { doi: "", date: "", author: "", title: "", journal: "", database: "" }]);
  };

  const addConference = () => {
    const last = conferences[conferences.length - 1];
    if (!last.date || !last.author || !last.title || !last.conference) {
      alert("請先將最後一列「國際研討會」的欄位填寫完整，再新增下一列！");
      return;
    }
    setConferences([...conferences, { date: "", author: "", title: "", conference: "", type: "口頭發表" }]);
  };

  const addExperience = () => {
    const last = experiences[experiences.length - 1];
    // 下拉選單預設是空字串，也必須檢查
    if (!last.institution || !last.title || !last.nature || !last.duration) {
      alert("請先將最後一列「研究經歷」的欄位（含下拉選單）填寫完整，再新增下一列！");
      return;
    }
    setExperiences([...experiences, { institution: "", title: "", nature: "", duration: "", hasAttachment: false }]);
  };
  // 更新欄位的函式
  const handleJournalChange = (index: number, field: string, value: string) => {
    const newData = [...journals];
    newData[index] = { ...newData[index], [field]: value };
    setJournals(newData);
  };

  const handleConfChange = (index: number, field: string, value: string) => {
    const newData = [...conferences];
    newData[index] = { ...newData[index], [field]: value };
    setConferences(newData);
  };

  const handleExpChange = (index: number, field: string, value: string | boolean) => {
    const newData = [...experiences];
    newData[index] = { ...newData[index], [field]: value };
    setExperiences(newData);
  };

  // DOI 抓取 API (模擬)
  const fetchPaperData = async (index: number) => {
    const doiValue = journals[index].doi;
    if (!doiValue) {
      alert("請先輸入 DOI 碼");
      return;
    }
    try {
      const response = await fetch(`/api/publications/fetch?doi=${encodeURIComponent(doiValue)}`);
      const result = await response.json();
      if (result.success) {
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

  // === 3. 畫面渲染 (UI Rendering) ===
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

        {/* ＝＝＝ 一、期刊發表區塊 ＝＝＝ */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h2 className="text-lg font-bold text-gray-800 border-l-4 border-blue-500 pl-3 mb-4 bg-gray-50 py-1">一、期刊發表</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse mb-4 min-w-[800px]">
              <thead>
                <tr className="bg-gray-100 text-gray-700 text-sm">
                  <th className="border p-2 text-left w-48">DOI 自動帶入</th>
                  <th className="border p-2 text-left w-36">發表日期</th>
                  <th className="border p-2 text-left w-36">作者/順位</th>
                  <th className="border p-2 text-left">期刊∕論文名稱</th>
                  <th className="border p-2 text-left w-32">資料庫</th>
                </tr>
              </thead>
              <tbody>
                {journals.map((journal, index) => (
                  <tr key={index}>
                    <td className="border p-2">
                      <div className="flex flex-col gap-2">
                        <input type="text" placeholder="10.10xx/..." className="w-full p-1 border rounded text-sm" value={journal.doi} onChange={(e) => handleJournalChange(index, "doi", e.target.value)} />
                        <button type="button" onClick={() => fetchPaperData(index)} className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-sm hover:bg-blue-200 transition">自動帶入</button>
                      </div>
                    </td>
                    <td className="border p-2"><input type="date" className="w-full p-1 border rounded text-sm" value={journal.date} onChange={(e) => handleJournalChange(index, "date", e.target.value)} /></td>
                    <td className="border p-2"><input type="text" className="w-full p-1 border rounded text-sm" placeholder="第一/通訊" value={journal.author} onChange={(e) => handleJournalChange(index, "author", e.target.value)} /></td>
                    <td className="border p-2">
                      <div className="flex flex-col gap-2">
                        <input type="text" className="w-full p-1 border rounded font-medium text-sm" placeholder="論文名稱" value={journal.title} onChange={(e) => handleJournalChange(index, "title", e.target.value)} />
                        <input type="text" className="w-full p-1 border rounded text-sm text-gray-600" placeholder="期刊名稱與期數" value={journal.journal} onChange={(e) => handleJournalChange(index, "journal", e.target.value)} />
                      </div>
                    </td>
                    <td className="border p-2"><input type="text" className="w-full p-1 border rounded text-sm" placeholder="如SSCI" value={journal.database} onChange={(e) => handleJournalChange(index, "database", e.target.value)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={addJournal} className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700 transition">+ 新增一列期刊</button>
        </div>

        {/* ＝＝＝ 二、國際研討會發表 ＝＝＝ */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h2 className="text-lg font-bold text-gray-800 border-l-4 border-blue-500 pl-3 mb-4 bg-gray-50 py-1">二、國際研討會發表</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse mb-4 min-w-[800px]">
              <thead>
                <tr className="bg-gray-100 text-gray-700 text-sm">
                  <th className="border p-2 text-left w-36">發表日期</th>
                  <th className="border p-2 text-left w-36">作者/順位</th>
                  <th className="border p-2 text-left">論文名稱</th>
                  <th className="border p-2 text-left">研討會名稱</th>
                  <th className="border p-2 text-left w-32">類別</th>
                </tr>
              </thead>
              <tbody>
                {conferences.map((conf, index) => (
                  <tr key={index}>
                    <td className="border p-2"><input type="date" className="w-full p-1 border rounded text-sm" value={conf.date} onChange={(e) => handleConfChange(index, "date", e.target.value)} /></td>
                    <td className="border p-2"><input type="text" className="w-full p-1 border rounded text-sm" value={conf.author} onChange={(e) => handleConfChange(index, "author", e.target.value)} /></td>
                    <td className="border p-2"><input type="text" className="w-full p-1 border rounded text-sm" value={conf.title} onChange={(e) => handleConfChange(index, "title", e.target.value)} /></td>
                    <td className="border p-2"><input type="text" className="w-full p-1 border rounded text-sm" value={conf.conference} onChange={(e) => handleConfChange(index, "conference", e.target.value)} /></td>
                    <td className="border p-2">
                      <select className="w-full p-1 border rounded text-sm bg-white" value={conf.type} onChange={(e) => handleConfChange(index, "type", e.target.value)}>
                        <option>口頭發表</option>
                        <option>壁報發表</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={addConference} className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700 transition">+ 新增一列研討會</button>
        </div>

        {/* ＝＝＝ 三、相關研究參與表現 ＝＝＝ */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h2 className="text-lg font-bold text-gray-800 border-l-4 border-blue-500 pl-3 mb-4 bg-gray-50 py-1">三、相關研究參與表現</h2>
          
          <h3 className="text-md font-semibold text-gray-700 mb-2 mt-4">(一) 研究經歷</h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse mb-4 min-w-[800px]">
              <thead>
                <tr className="bg-gray-100 text-gray-700 text-sm">
                  <th className="border p-2 text-left">機構/主持人</th>
                  <th className="border p-2 text-left w-32">職稱</th>
                  <th className="border p-2 text-left w-36">性質</th>
                  <th className="border p-2 text-left w-48">起訖日期</th>
                  <th className="border p-2 text-center w-20">附件</th>
                </tr>
              </thead>
              <tbody>
                {experiences.map((exp, index) => (
                  <tr key={index}>
                    <td className="border p-2"><input type="text" className="w-full p-1 border rounded text-sm" placeholder="如：OO大學/OOO教授" value={exp.institution} onChange={(e) => handleExpChange(index, "institution", e.target.value)} /></td>
                    <td className="border p-2">
                      <select className="w-full p-1 border rounded text-sm bg-white" value={exp.title} onChange={(e) => handleExpChange(index, "title", e.target.value)}>
                        <option value="">請選擇</option>
                        <option>研究者本人</option>
                        <option>研究助理</option>
                        <option>工讀生</option>
                        <option>其他</option>
                      </select>
                    </td>
                    <td className="border p-2">
                      <select className="w-full p-1 border rounded text-sm bg-white" value={exp.nature} onChange={(e) => handleExpChange(index, "nature", e.target.value)}>
                        <option value="">請選擇</option>
                        <option>教師研究案</option>
                        <option>畢業專案</option>
                        <option>其他</option>
                      </select>
                    </td>
                    <td className="border p-2"><input type="text" className="w-full p-1 border rounded text-sm" placeholder="2023/01-2024/01" value={exp.duration} onChange={(e) => handleExpChange(index, "duration", e.target.value)} /></td>
                    <td className="border p-2 text-center">
                      <input type="checkbox" className="w-4 h-4 cursor-pointer" checked={exp.hasAttachment as boolean} onChange={(e) => handleExpChange(index, "hasAttachment", e.target.checked)} /> 有
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={addExperience} className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700 transition mb-6">+ 新增一列研究經歷</button>

          <h3 className="text-md font-semibold text-gray-700 mb-2">(二) 研究獲獎/獎助</h3>
          <textarea rows={3} className="w-full p-2 border border-gray-300 rounded focus:border-blue-500 focus:outline-none" placeholder="請填寫名稱、計畫編號、金額等" value={awards} onChange={(e) => setAwards(e.target.value)}></textarea>
        </div>

        {/* ＝＝＝ 五、其他表現 ＝＝＝ */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h2 className="text-lg font-bold text-gray-800 border-l-4 border-blue-500 pl-3 mb-4 bg-gray-50 py-1">五、其他有助於審查之優秀事蹟說明</h2>
          <textarea rows={4} className="w-full p-2 border border-gray-300 rounded focus:border-blue-500 focus:outline-none" placeholder="例如：專利發表、獲獎紀錄、語言能力證明 (JLPT, TOEFL等)" value={otherAchievements} onChange={(e) => setOtherAchievements(e.target.value)}></textarea>
        </div>

        {/* 列印與簽名區塊 */}
        <div className="text-center mt-12 mb-8 print:hidden">
          <button type="button" onClick={() => window.print()} className="bg-gray-800 text-white px-8 py-3 rounded-lg hover:bg-gray-700 transition text-lg shadow-md">
            產生 PDF / 預覽列印
          </button>
        </div>
      </form>
    </div>
  );
}