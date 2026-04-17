"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea"

export default function ScholarshipForm() {
  // === 1. 狀態管理 (State Management) ===
  const [journals, setJournals] = useState([
    { doi: "", date: "", author: "", title: "", journal: "", database: "" },
  ]);

  const [conferences, setConferences] = useState([
    { date: "", author: "", title: "", conference: "", type: "口頭發表" },
  ]);

  const [experiences, setExperiences] = useState([
    { institution: "", title: "", nature: "", duration: "", hasAttachment: false },
  ]);

  const [awards, setAwards] = useState("");
  const [otherAchievements, setOtherAchievements] = useState("");

  // === 2. 處理函式 (Handlers) ===
  const addJournal = () => {
    const last = journals[journals.length - 1];
    if (!last.date || !last.author || !last.title || !last.journal || !last.database) {
      alert("請先將最後一列「期刊發表」的欄位填寫完整，再新增下一列！");
      return; 
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
    if (!last.institution || !last.title || !last.nature || !last.duration) {
      alert("請先將最後一列「研究經歷」的欄位填寫完整，再新增下一列！");
      return;
    }
    setExperiences([...experiences, { institution: "", title: "", nature: "", duration: "", hasAttachment: false }]);
  };

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
        } catch {
      alert("連線發生錯誤，請稍後再試。");
    }
  };

  // === 3. 畫面渲染 (UI Rendering) ===
  return (
    <div className="max-w-5xl mx-auto py-10 px-4 sm:px-6 bg-slate-50 min-h-screen font-sans">
      <h1 className="text-3xl font-bold text-center text-[#1a3a5f] mb-8">
        竹師教育學院博士生獎學金學術表現表
      </h1>

      <form className="space-y-8">
        {/* 基本資料區塊 */}
        <Card className="shadow-sm">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="applicantName">申請人姓名</Label>
                <Input id="applicantName" placeholder="請輸入姓名" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="department">所屬學系所</Label>
                <Input id="department" placeholder="請輸入系所名稱" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ＝＝＝ 一、期刊發表區塊 ＝＝＝ */}
        <Card className="shadow-sm">
          <CardHeader className="pb-4 border-b">
            <CardTitle className="text-lg font-bold text-slate-800 border-l-4 border-blue-500 pl-3">
              一、期刊發表
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="overflow-x-auto rounded-md border">
              <Table className="min-w-[800px]">
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="w-48">DOI 自動帶入</TableHead>
                    <TableHead className="w-40">發表日期</TableHead>
                    <TableHead className="w-36">作者/順位</TableHead>
                    <TableHead>期刊∕論文名稱</TableHead>
                    <TableHead className="w-40">資料庫</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {journals.map((journal, index) => (
                    <TableRow key={index}>
                      <TableCell className="align-top">
                        <div className="flex flex-col gap-2">
                          <Input placeholder="10.10xx/..." value={journal.doi} onChange={(e) => handleJournalChange(index, "doi", e.target.value)} />
                          <Button type="button" variant="secondary" size="sm" onClick={() => fetchPaperData(index)}>自動帶入</Button>
                        </div>
                      </TableCell>
                      <TableCell className="align-top"><Input type="date" value={journal.date} onChange={(e) => handleJournalChange(index, "date", e.target.value)} /></TableCell>
                      <TableCell className="align-top"><Input placeholder="第一/通訊" value={journal.author} onChange={(e) => handleJournalChange(index, "author", e.target.value)} /></TableCell>
                      <TableCell className="align-top">
                        <div className="flex flex-col gap-2">
                          <Input className="font-medium" placeholder="論文名稱" value={journal.title} onChange={(e) => handleJournalChange(index, "title", e.target.value)} />
                          <Input className="text-muted-foreground" placeholder="期刊名稱與期數" value={journal.journal} onChange={(e) => handleJournalChange(index, "journal", e.target.value)} />
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <Select value={journal.database} onValueChange={(val) => handleJournalChange(index, "database", val)}>
                          <SelectTrigger>
                            <SelectValue placeholder="選擇資料庫" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="SSCI">SSCI</SelectItem>
                            <SelectItem value="SCI">SCI</SelectItem>
                            <SelectItem value="TSSCI">TSSCI</SelectItem>
                            <SelectItem value="THCI">THCI</SelectItem>
                            <SelectItem value="Scopus">Scopus</SelectItem>
                            <SelectItem value="其他">其他</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="mt-4">
              <Button type="button" variant="outline" className="w-full border-dashed" onClick={addJournal}>＋ 新增期刊發表</Button>
            </div>
          </CardContent>
        </Card>

        {/* ＝＝＝ 二、國際研討會 ＝＝＝ */}
        <Card className="shadow-sm">
          <CardHeader className="pb-4 border-b">
            <CardTitle className="text-lg font-bold text-slate-800 border-l-4 border-emerald-500 pl-3">
              二、國際研討會 (口頭發表/海報發表)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="overflow-x-auto rounded-md border">
              <Table className="min-w-[800px]">
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="w-40">發表日期</TableHead>
                    <TableHead className="w-36">作者/順位</TableHead>
                    <TableHead>發表主題</TableHead>
                    <TableHead>研討會名稱</TableHead>
                    <TableHead className="w-40">發表形式</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {conferences.map((conf, index) => (
                    <TableRow key={index}>
                      <TableCell><Input type="date" value={conf.date} onChange={(e) => handleConfChange(index, "date", e.target.value)} /></TableCell>
                      <TableCell><Input placeholder="第一作者" value={conf.author} onChange={(e) => handleConfChange(index, "author", e.target.value)} /></TableCell>
                      <TableCell><Input className="font-medium" placeholder="發表主題" value={conf.title} onChange={(e) => handleConfChange(index, "title", e.target.value)} /></TableCell>
                      <TableCell><Input placeholder="研討會名稱" value={conf.conference} onChange={(e) => handleConfChange(index, "conference", e.target.value)} /></TableCell>
                      <TableCell>
                        <Select value={conf.type} onValueChange={(val) => handleConfChange(index, "type", val)}>
                          <SelectTrigger>
                            <SelectValue placeholder="發表形式" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="口頭發表">口頭發表</SelectItem>
                            <SelectItem value="海報發表">海報發表</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="mt-4">
              <Button type="button" variant="outline" className="w-full border-dashed" onClick={addConference}>＋ 新增研討會發表</Button>
            </div>
          </CardContent>
        </Card>

        {/* ＝＝＝ 三、研究群及國際合作經歷 ＝＝＝ */}
        <Card className="shadow-sm">
          <CardHeader className="pb-4 border-b">
            <CardTitle className="text-lg font-bold text-slate-800 border-l-4 border-purple-500 pl-3">
              三、參與研究群及國際合作經歷
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="overflow-x-auto rounded-md border">
              <Table className="min-w-[800px]">
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead>機構/學校</TableHead>
                    <TableHead>計畫/專案名稱</TableHead>
                    <TableHead className="w-48">參與性質</TableHead>
                    <TableHead className="w-48">參與期間</TableHead>
                    <TableHead className="w-24 text-center">佐證資料</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {experiences.map((exp, index) => (
                    <TableRow key={index}>
                      <TableCell><Input placeholder="如：牛津大學研究室" value={exp.institution} onChange={(e) => handleExpChange(index, "institution", e.target.value)} /></TableCell>
                      <TableCell><Input className="font-medium" placeholder="OO研究計畫" value={exp.title} onChange={(e) => handleExpChange(index, "title", e.target.value)} /></TableCell>
                      <TableCell>
                        <Select value={exp.nature} onValueChange={(val) => handleExpChange(index, "nature", val)}>
                          <SelectTrigger>
                            <SelectValue placeholder="請選擇性質" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="國際合作">國際合作</SelectItem>
                            <SelectItem value="國內研究群">國內研究群</SelectItem>
                            <SelectItem value="跨領域計畫">跨領域計畫</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell><Input placeholder="如：2023.01~2023.06" value={exp.duration} onChange={(e) => handleExpChange(index, "duration", e.target.value)} /></TableCell>
                      <TableCell className="text-center align-middle">
                        <div className="flex justify-center">
                            <Checkbox checked={exp.hasAttachment} onCheckedChange={(checked) => handleExpChange(index, "hasAttachment", checked === true)} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="mt-4">
              <Button type="button" variant="outline" className="w-full border-dashed" onClick={addExperience}>＋ 新增研究經歷</Button>
            </div>
          </CardContent>
        </Card>

        {/* ＝＝＝ 四、得獎紀錄 ＝＝＝ */}
        <Card className="shadow-sm">
          <CardHeader className="pb-4 border-b">
            <CardTitle className="text-lg font-bold text-slate-800 border-l-4 border-amber-500 pl-3">
              四、得獎紀錄
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="mb-3 text-sm text-slate-500 flex items-center justify-between">
              <span>請列出歷年學術或競賽得獎紀錄（請註明年份、獎項名稱及頒獎機構）</span>
              {awards && <Button type="button" variant="ghost" size="sm" onClick={() => setAwards("")}>清空</Button>}
            </div>
            <Textarea
              className="min-h-[120px] resize-y"
              placeholder="1. 2023年，獲國科會大專學生研究計畫研究創作獎&#10;2. 2022年，獲竹師教育學院傑出論文獎"
              value={awards}
              onChange={(e) => setAwards(e.target.value)}
            />
          </CardContent>
        </Card>

        {/* ＝＝＝ 五、其他傑出學術表現 ＝＝＝ */}
        <Card className="shadow-sm">
          <CardHeader className="pb-4 border-b">
            <CardTitle className="text-lg font-bold text-slate-800 border-l-4 border-rose-500 pl-3">
              五、其他傑出學術表現
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="mb-3 text-sm text-slate-500 flex items-center justify-between">
              <span>如：取得專利、出版專書、受邀學術演講等</span>
              {otherAchievements && <Button type="button" variant="ghost" size="sm" onClick={() => setOtherAchievements("")}>清空</Button>}
            </div>
            <Textarea
              className="min-h-[120px] resize-y"
              placeholder="1. 2023年 發明專利：一種新型教學輔具設計...&#10;2. 2022年 受邀至OO大學進行學術專題演講..."
              value={otherAchievements}
              onChange={(e) => setOtherAchievements(e.target.value)}
            />
          </CardContent>
        </Card>

        {/* 提交按鈕區 */}
        <div className="flex justify-center gap-4 mt-8 pb-12">
          <Button type="button" variant="outline" className="w-32" onClick={() => {
            if (confirm("確定要清空所有填寫資料嗎？")) {
               setJournals([{ doi: "", date: "", author: "", title: "", journal: "", database: "" }]);
               setConferences([{ date: "", author: "", title: "", conference: "", type: "口頭發表" }]);
               setExperiences([{ institution: "", title: "", nature: "", duration: "", hasAttachment: false }]);
               setAwards("");
               setOtherAchievements("");
            }
          }}>
            清除重填
          </Button>
          <Button type="button" className="w-32 bg-[#1a3a5f] hover:bg-[#1a3a5f]/90" onClick={() => {
            alert("此為展示用範本，尚未串接後端儲存功能。");
          }}>
            儲存資料
          </Button>
          <Button type="button" className="w-32 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => {
            alert("正在產生 PDF 並送出申請...");
          }}>
            送出申請
          </Button>
        </div>
      </form>
    </div>
  );
}
