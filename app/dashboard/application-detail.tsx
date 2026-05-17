"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ScholarshipApplication } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Download, FileText } from "lucide-react";

type ApplicationDetailProps = {
  application: ScholarshipApplication | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2 py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-sm font-medium text-slate-500">{label}</span>
      <span className="text-sm text-slate-900">{value || "—"}</span>
    </div>
  );
}

export function ApplicationDetail({
  application,
  open,
  onOpenChange,
}: ApplicationDetailProps) {
  if (!application) return null;

  const { payload, files } = application;
  const { applicantInfo, eligibility, academicPerformance } = payload;
  const journals = payload.journals ?? [];
  const conferences = payload.conferences ?? [];
  const researchExperiences = payload.researchExperiences ?? [];
  const researchAwards = payload.researchAwards ?? [];
  const plannedResearch = payload.plannedResearch ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="data-[side=right]:sm:max-w-2xl overflow-y-auto bg-white"
      >
        <SheetHeader className="border-b border-slate-200 pb-4">
          <SheetTitle className="text-lg">
            {applicantInfo.applicantName} — 申請資料詳情
          </SheetTitle>
          <SheetDescription>
            {applicantInfo.department} /{" "}
            {applicantInfo.studentId} /{" "}
            指導教授：{applicantInfo.advisorName}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6">
          <Tabs defaultValue="basic" className="flex-col">
            <TabsList className="mt-2 mb-4">
              <TabsTrigger value="basic">基本資料</TabsTrigger>
              <TabsTrigger value="academic">學術表現</TabsTrigger>
              <TabsTrigger value="research">研究經歷</TabsTrigger>
              <TabsTrigger value="plan">計畫與其他</TabsTrigger>
            </TabsList>

            {/* ── Tab 1: 基本資料 ── */}
            <TabsContent value="basic" className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">申請人資訊</CardTitle>
                </CardHeader>
                <CardContent className="space-y-0">
                  <InfoRow label="姓名" value={applicantInfo.applicantName} />
                  <InfoRow label="學號" value={applicantInfo.studentId} />
                  <InfoRow label="系所" value={applicantInfo.department} />
                  <InfoRow label="Email" value={applicantInfo.email} />
                  <InfoRow label="手機" value={applicantInfo.phone} />
                  <InfoRow label="指導教授" value={applicantInfo.advisorName} />
                  <InfoRow
                    label="入學學年度"
                    value={applicantInfo.admissionAcademicYear}
                  />
                  <InfoRow label="新領/續領" value={applicantInfo.studyStatus} />
                  <InfoRow
                    label="申請類別"
                    value={applicantInfo.applicationType}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">請領資格</CardTitle>
                </CardHeader>
                <CardContent className="space-y-0">
                  <InfoRow
                    label="學士班排名"
                    value={
                      eligibility.bachelorRankPercent
                        ? `前 ${eligibility.bachelorRankPercent}%`
                        : ""
                    }
                  />
                  <InfoRow
                    label="碩士班 GPA"
                    value={
                      eligibility.masterGpa
                        ? `${eligibility.masterGpa} / ${eligibility.gpaScale}`
                        : ""
                    }
                  />
                  <InfoRow
                    label="碩士百分制"
                    value={eligibility.masterPercentScore}
                  />
                  <InfoRow
                    label="特殊推薦"
                    value={eligibility.hasSpecialRecommendation ? "是" : "否"}
                  />
                  <InfoRow
                    label="無專職工作"
                    value={eligibility.noFullTimeJob ? "是" : "否"}
                  />
                  <InfoRow
                    label="未重複請領"
                    value={
                      eligibility.notReceivingOtherScholarship ? "是" : "否"
                    }
                  />
                  {eligibility.eligibilityNotes && (
                    <InfoRow
                      label="補充說明"
                      value={eligibility.eligibilityNotes}
                    />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">學業表現</CardTitle>
                </CardHeader>
                <CardContent className="space-y-0">
                  <InfoRow
                    label="累計 GPA"
                    value={`${academicPerformance.cumulativeGpa} / ${academicPerformance.cumulativeGpaScale}`}
                  />
                  <InfoRow
                    label="班排名"
                    value={
                      academicPerformance.classRankPercent
                        ? `前 ${academicPerformance.classRankPercent}%`
                        : ""
                    }
                  />
                  <InfoRow
                    label="已修學分"
                    value={academicPerformance.completedCredits}
                  />
                  <InfoRow
                    label="操行成績"
                    value={academicPerformance.conductScore}
                  />
                  {academicPerformance.transcriptNotes && (
                    <InfoRow
                      label="成績備註"
                      value={academicPerformance.transcriptNotes}
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Tab 2: 學術表現 ── */}
            <TabsContent value="academic" className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    期刊發表
                    <Badge variant="secondary">{journals.length} 篇</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {journals.length === 0 ? (
                    <p className="text-sm text-slate-400">無期刊發表紀錄</p>
                  ) : (
                    <div className="space-y-3">
                      {journals.map((j, idx) => (
                        <div
                          key={j.doi || idx}
                          className="rounded-md border border-slate-200 p-3 space-y-1.5"
                        >
                          <p className="text-sm font-medium text-slate-900">
                            {j.title}
                          </p>
                          <p className="text-xs text-slate-500">{j.journal}</p>
                          <p className="text-xs text-slate-500">
                            作者：{j.author}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            <Badge variant="outline" className="text-xs">
                              {j.authorOrder}
                            </Badge>
                            {j.isCorrespondingAuthor && (
                              <Badge variant="outline" className="text-xs">
                                通訊作者
                              </Badge>
                            )}
                            {j.database && (
                              <Badge className="text-xs">{j.database}</Badge>
                            )}
                            <Badge
                              variant={
                                j.journalLevel === "I級期刊"
                                  ? "default"
                                  : "secondary"
                              }
                              className="text-xs"
                            >
                              {j.journalLevel}
                            </Badge>
                            {j.hasTrustedDatabase === "是" && (
                              <Badge
                                variant="outline"
                                className="text-xs text-emerald-600 border-emerald-200"
                              >
                                具公信力資料庫
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-400">
                            DOI: {j.doi} | 日期: {j.date}
                          </p>
                          {j.indexSource && (
                            <p className="text-xs text-slate-400">
                              判別來源：{j.indexSource}
                            </p>
                          )}
                          {j.authorOrderModified && j.authorOrderChangeNote && (
                            <p className="text-xs text-amber-600">
                              作者順位變更：{j.authorOrderChangeNote}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    研討會發表
                    <Badge variant="secondary">{conferences.length} 篇</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {conferences.length === 0 ? (
                    <p className="text-sm text-slate-400">無研討會發表紀錄</p>
                  ) : (
                    <div className="space-y-3">
                      {conferences.map((c, idx) => (
                        <div
                          key={idx}
                          className="rounded-md border border-slate-200 p-3 space-y-1.5"
                        >
                          <p className="text-sm font-medium text-slate-900">
                            {c.title}
                          </p>
                          <p className="text-xs text-slate-500">
                            {c.conference}
                          </p>
                          <p className="text-xs text-slate-500">
                            主辦單位：{c.organizer} | 作者：{c.author}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            <Badge variant="outline" className="text-xs">
                              {c.authorOrder}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {c.type}
                            </Badge>
                            {c.database && (
                              <Badge className="text-xs">{c.database}</Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-400">
                            日期: {c.date}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Tab 3: 研究經歷 ── */}
            <TabsContent value="research" className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">相關研究參與</CardTitle>
                </CardHeader>
                <CardContent>
                  {researchExperiences.length === 0 ? (
                    <p className="text-sm text-slate-400">無研究參與紀錄</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>機構/主持人</TableHead>
                          <TableHead>職稱</TableHead>
                          <TableHead>性質</TableHead>
                          <TableHead>期間</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {researchExperiences.map((r, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="text-xs max-w-[180px] whitespace-normal">
                              {r.institution}
                            </TableCell>
                            <TableCell className="text-xs">{r.role}</TableCell>
                            <TableCell className="text-xs">
                              {r.nature}
                            </TableCell>
                            <TableCell className="text-xs">
                              {r.duration}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">研究獲獎/獎助</CardTitle>
                </CardHeader>
                <CardContent>
                  {researchAwards.length === 0 ? (
                    <p className="text-sm text-slate-400">無獲獎紀錄</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>名稱</TableHead>
                          <TableHead>編號</TableHead>
                          <TableHead>金額/項目</TableHead>
                          <TableHead>貢獻</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {researchAwards.map((a, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="text-xs max-w-[200px] whitespace-normal">
                              {a.name}
                            </TableCell>
                            <TableCell className="text-xs">
                              {a.projectNumber || "—"}
                            </TableCell>
                            <TableCell className="text-xs">
                              {a.amountOrItem}
                            </TableCell>
                            <TableCell className="text-xs">
                              {a.contribution}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Tab 4: 計畫與其他 ── */}
            <TabsContent value="plan" className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    獲獎當學年預計研究議題
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {plannedResearch.length === 0 ? (
                    <p className="text-sm text-slate-400">無預計研究議題</p>
                  ) : (
                    <div className="space-y-3">
                      {plannedResearch.map((p, idx) => (
                        <div
                          key={idx}
                          className="rounded-md border border-slate-200 p-3 space-y-1"
                        >
                          <p className="text-sm font-medium">{p.title}</p>
                          <p className="text-xs text-slate-500">
                            預計投稿：{p.targetVenue}
                          </p>
                          <p className="text-xs text-slate-500">
                            預計時間：{p.expectedDate} | 指導教授：{p.advisor}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {p.hasTrustedDatabase === "是" && (
                              <Badge
                                variant="outline"
                                className="text-xs text-emerald-600 border-emerald-200"
                              >
                                具公信力資料庫
                              </Badge>
                            )}
                            {p.database && (
                              <Badge variant="outline" className="text-xs">
                                {p.database}
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {payload.otherAchievements && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">其他優秀事蹟</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-slate-700">
                      {payload.otherAchievements}
                    </p>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">上傳檔案</CardTitle>
                </CardHeader>
                <CardContent>
                  {files.length === 0 ? (
                    <p className="text-sm text-slate-400">無上傳檔案</p>
                  ) : (
                    <div className="space-y-2">
                      {files.map((f, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 rounded-md border border-slate-100 px-3 py-2"
                        >
                          <FileText className="size-4 text-slate-400 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-slate-700 truncate">
                              {f.name}
                            </p>
                            <p className="text-xs text-slate-400 truncate">
                              {(f.size / 1024).toFixed(0)} KB
                            </p>
                          </div>
                          <a
                            href={`/api/dashboard/download?path=${encodeURIComponent(f.path)}&name=${encodeURIComponent(f.name)}`}
                            download
                            className="shrink-0"
                          >
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-slate-400 hover:text-emerald-600"
                            >
                              <Download className="size-4" />
                            </Button>
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
