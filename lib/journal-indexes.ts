export type JournalIndexRecord = {
  journalTitle: string;
  issns: string[];
  database: string;
  level: "I級期刊" | "非I級期刊";
};

const journalIndexRecords: JournalIndexRecord[] = [
  // Seed list for common education-related journals.
  // Please verify and adjust against the college/department's official I-level list.
  {
    journalTitle: "Review of Educational Research",
    issns: ["0034-6543", "1935-1046"],
    database: "SSCI",
    level: "I級期刊",
  },
  {
    journalTitle: "Educational Researcher",
    issns: ["0013-189X", "1935-102X"],
    database: "SSCI",
    level: "I級期刊",
  },
  {
    journalTitle: "American Educational Research Journal",
    issns: ["0002-8312", "1935-1011"],
    database: "SSCI",
    level: "I級期刊",
  },
  {
    journalTitle: "Journal of Educational Psychology",
    issns: ["0022-0663", "1939-2176"],
    database: "SSCI",
    level: "I級期刊",
  },
  {
    journalTitle: "Learning and Instruction",
    issns: ["0959-4752", "1873-3263"],
    database: "SSCI",
    level: "I級期刊",
  },
  {
    journalTitle: "Educational Research Review",
    issns: ["1747-938X", "1878-0385"],
    database: "SSCI",
    level: "I級期刊",
  },
  {
    journalTitle: "Computers & Education",
    issns: ["0360-1315", "1873-782X"],
    database: "SSCI",
    level: "I級期刊",
  },
  {
    journalTitle: "Teaching and Teacher Education",
    issns: ["0742-051X", "1879-2480"],
    database: "SSCI",
    level: "I級期刊",
  },
  {
    journalTitle: "Journal of Teacher Education",
    issns: ["0022-4871", "1552-7816"],
    database: "SSCI",
    level: "I級期刊",
  },
  {
    journalTitle: "Educational Evaluation and Policy Analysis",
    issns: ["0162-3737", "1935-1062"],
    database: "SSCI",
    level: "I級期刊",
  },
  {
    journalTitle: "Higher Education",
    issns: ["0018-1560", "1573-174X"],
    database: "SSCI",
    level: "I級期刊",
  },
  {
    journalTitle: "Studies in Higher Education",
    issns: ["0307-5079", "1470-174X"],
    database: "SSCI",
    level: "I級期刊",
  },
  {
    journalTitle: "The Internet and Higher Education",
    issns: ["1096-7516", "1873-5525"],
    database: "SSCI",
    level: "I級期刊",
  },
  {
    journalTitle: "British Journal of Educational Technology",
    issns: ["0007-1013", "1467-8535"],
    database: "SSCI",
    level: "I級期刊",
  },
  {
    journalTitle: "Learning and Individual Differences",
    issns: ["1041-6080", "1873-3425"],
    database: "SSCI",
    level: "I級期刊",
  },
  {
    journalTitle: "Instructional Science",
    issns: ["0020-4277", "1573-1952"],
    database: "SSCI",
    level: "I級期刊",
  },
  {
    journalTitle: "Early Childhood Research Quarterly",
    issns: ["0885-2006", "1873-7706"],
    database: "SSCI",
    level: "I級期刊",
  },
  {
    journalTitle: "Journal of Special Education",
    issns: ["0022-4669", "1538-4764"],
    database: "SSCI",
    level: "I級期刊",
  },
  {
    journalTitle: "Journal of Research in Science Teaching",
    issns: ["0022-4308", "1098-2736"],
    database: "SCIE",
    level: "I級期刊",
  },
  {
    journalTitle: "Science Education",
    issns: ["0036-8326", "1098-237X"],
    database: "SCIE",
    level: "I級期刊",
  },
  {
    journalTitle: "Physical Review Physics Education Research",
    issns: ["2469-9896"],
    database: "SCIE",
    level: "I級期刊",
  },
  {
    journalTitle: "CBE-Life Sciences Education",
    issns: ["1931-7913"],
    database: "SCIE",
    level: "I級期刊",
  },
  {
    journalTitle: "Journal of Engineering Education",
    issns: ["1069-4730", "2168-9830"],
    database: "SCIE",
    level: "I級期刊",
  },
  {
    journalTitle: "教育研究集刊",
    issns: ["1028-8708"],
    database: "TSSCI",
    level: "I級期刊",
  },
  {
    journalTitle: "Bulletin of Educational Research",
    issns: ["1028-8708"],
    database: "TSSCI",
    level: "I級期刊",
  },
  {
    journalTitle: "教育科學研究期刊",
    issns: ["2073-753X"],
    database: "TSSCI",
    level: "I級期刊",
  },
  {
    journalTitle: "Journal of Research in Education Sciences",
    issns: ["2073-753X"],
    database: "TSSCI",
    level: "I級期刊",
  },
  {
    journalTitle: "當代教育研究季刊",
    issns: ["1814-4810"],
    database: "TSSCI",
    level: "I級期刊",
  },
  {
    journalTitle: "Contemporary Educational Research Quarterly",
    issns: ["1814-4810"],
    database: "TSSCI",
    level: "I級期刊",
  },
  {
    journalTitle: "教育心理學報",
    issns: ["1011-5714"],
    database: "TSSCI",
    level: "I級期刊",
  },
  {
    journalTitle: "Bulletin of Educational Psychology",
    issns: ["1011-5714"],
    database: "TSSCI",
    level: "I級期刊",
  },
  {
    journalTitle: "課程與教學季刊",
    issns: ["1560-1277"],
    database: "TSSCI",
    level: "I級期刊",
  },
  {
    journalTitle: "Curriculum & Instruction Quarterly",
    issns: ["1560-1277"],
    database: "TSSCI",
    level: "I級期刊",
  },
  {
    journalTitle: "Australasian Journal of Educational Technology",
    issns: ["1449-3098", "1449-5554"],
    database: "SCOPUS",
    level: "I級期刊",
  },
  {
    journalTitle: "Educational Technology Research and Development",
    issns: ["1042-1629", "1556-6501"],
    database: "SCOPUS",
    level: "I級期刊",
  },
  {
    journalTitle: "International Review of Research in Open and Distributed Learning",
    issns: ["1492-3831"],
    database: "SCOPUS",
    level: "I級期刊",
  },
];

function normalizeValue(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, "");
}

export function findJournalIndexMatch({
  issns,
  journalTitle,
}: {
  issns: string[];
  journalTitle: string;
}) {
  const normalizedIssns = new Set(
    issns.map((issn) => issn.replace(/[^0-9xX]/g, "").toLocaleUpperCase())
  );
  const normalizedTitle = normalizeValue(journalTitle);

  return journalIndexRecords.find((record) => {
    const hasMatchingIssn = record.issns.some((issn) =>
      normalizedIssns.has(issn.replace(/[^0-9xX]/g, "").toLocaleUpperCase())
    );
    const hasMatchingTitle =
      normalizedTitle.length > 0 &&
      normalizeValue(record.journalTitle) === normalizedTitle;

    return hasMatchingIssn || hasMatchingTitle;
  });
}
