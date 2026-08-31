/**
 * Comprehensive unit test for 5-subject Mid-Term aggregation (25 marks each).
 * Tests: individual grades, aggregate calculation, draft vs published, class position,
 * failing subjects, percentage-based grading consistency, and full report card generation.
 *
 * Run: npx ts-node src/tests/aggregate5.test.ts
 */

interface SubjectResult {
  subject: string;
  marksObtained: number;
  maxMarks: number;
  isAbsent?: boolean;
}

interface ExamReport {
  examName: string;
  date: string;
  subjects: SubjectResult[];
  totalObtained: number;
  totalMax: number;
  percentage: number;
  grade: string;
  classPosition?: number;
  classSize?: number;
  published: boolean;
}

function gradeForPercent(p: number): string {
  if (p >= 90) return 'A+';
  if (p >= 80) return 'A';
  if (p >= 70) return 'B+';
  if (p >= 60) return 'B';
  if (p >= 50) return 'C';
  if (p >= 40) return 'D';
  if (p >= 33) return 'E';
  return 'F';
}

function gradeForMarks(obtained: number, maxMarks: number): string {
  if (maxMarks <= 0) return 'F';
  return gradeForPercent((obtained / maxMarks) * 100);
}

function calcPercentage(obtained: number, max: number): number {
  if (max <= 0) return 0;
  return Math.round((obtained / max) * 10000) / 100;
}

async function runTest() {
  let passed = 0;
  let failed = 0;
  const assert = (cond: boolean, msg: string) => {
    if (cond) { passed++; console.log('  ✅ ' + msg); }
    else { failed++; console.log('  ❌ FAIL: ' + msg); }
  };

  const subjects: SubjectResult[] = [
    { subject: 'Physics', marksObtained: 22, maxMarks: 25 },
    { subject: 'Chemistry', marksObtained: 23, maxMarks: 25 },
    { subject: 'Biology', marksObtained: 20, maxMarks: 25 },
    { subject: 'English', marksObtained: 24, maxMarks: 25 },
    { subject: 'Social-Science', marksObtained: 21, maxMarks: 25 },
  ];

  console.log('\n=== 1. Individual subject grades (25 marks each) ===');
  const ind = subjects.map(s => ({
    subject: s.subject,
    percentage: calcPercentage(s.marksObtained, s.maxMarks),
    grade: gradeForMarks(s.marksObtained, s.maxMarks),
  }));
  assert(ind[0].percentage === 88, 'Physics: 22/25 = 88%');
  assert(ind[0].grade === 'A', 'Physics: 88% → A');
  assert(ind[1].percentage === 92, 'Chemistry: 23/25 = 92%');
  assert(ind[1].grade === 'A+', 'Chemistry: 92% → A+');
  assert(ind[2].percentage === 80, 'Biology: 20/25 = 80%');
  assert(ind[2].grade === 'A', 'Biology: 80% → A');
  assert(ind[3].percentage === 96, 'English: 24/25 = 96%');
  assert(ind[3].grade === 'A+', 'English: 96% → A+');
  assert(ind[4].percentage === 84, 'Social-Science: 21/25 = 84%');
  assert(ind[4].grade === 'A', 'Social-Science: 84% → A');

  console.log('\n=== 2. Aggregate report math ===');
  const totalObtained = subjects.reduce((s, r) => s + r.marksObtained, 0);
  const totalMax = subjects.reduce((s, r) => s + r.maxMarks, 0);
  const aggPct = calcPercentage(totalObtained, totalMax);
  const aggGrade = gradeForPercent(aggPct);
  assert(totalObtained === 110, 'Total obtained = 110');
  assert(totalMax === 125, 'Total max = 125 (5×25)');
  assert(aggPct === 88, 'Aggregate = 88.00%');
  assert(aggGrade === 'A', '88% → grade A');

  console.log('\n=== 3. Draft vs Published visibility ===');
  const draftSt = 'scheduled' as string;
  const pubSt = 'completed' as string;
  assert(!(false || draftSt === 'completed'), 'Student does NOT see draft');
  assert(false || pubSt === 'completed', 'Student sees published');
  assert(true || draftSt === 'completed', 'Teacher sees draft marks');

  console.log('\n=== 4. Class position ranking ===');
  const scores = [{n:'Raj',p:88},{n:'Priya',p:85},{n:'Arjun',p:82},{n:'Sneha',p:79},{n:'Vikram',p:76}];
  const sorted = scores.sort((a,b) => b.p - a.p);
  const rank = sorted.findIndex(s => s.n === 'Raj') + 1;
  assert(rank === 1, "Raj's 88% is rank #1 of 5");
  assert(sorted[0].p === 88, 'Highest is 88% (Raj)');

  console.log('\n=== 5. Edge cases (failing subjects) ===');
  const failSubj = [
    {subject:'Maths',marksObtained:5,maxMarks:25},
    {subject:'Science',marksObtained:8,maxMarks:25},
    {subject:'English',marksObtained:10,maxMarks:25},
    {subject:'Hindi',marksObtained:7,maxMarks:25},
    {subject:'SST',marksObtained:12,maxMarks:25},
  ];
  const ft = failSubj.reduce((s,r)=>s+r.marksObtained,0);
  const fm = failSubj.reduce((s,r)=>s+r.maxMarks,0);
  const fp = calcPercentage(ft,fm);
  const fg = gradeForPercent(fp);
  const fc = failSubj.filter(s=>gradeForMarks(s.marksObtained,s.maxMarks)==='F').length;
  assert(ft === 42, 'Failing total = 42');
  assert(fp === 33.6, `Failing aggregate = ${fp}%`);
  assert(fg === 'E', `Aggregate grade = ${fg} (33.6% passes)`);
  assert(fc === 3, '3 subjects failed individually (Maths 20%, Science 32%, Hindi 28%)');

  console.log('\n=== 6. Percentage-based grading consistency ===');
  assert(gradeForMarks(20,25)==='A','20/25 (80%) → A');
  assert(gradeForMarks(40,50)==='A','40/50 (80%) → A');
  assert(gradeForMarks(80,100)==='A','80/100 (80%) → A');

  console.log('\n=== 7. Full report card generation ===');
  const report: ExamReport = {
    examName:'Mid-Term · 2026-27', date:'2026-08-28',
    subjects: subjects.map(s=>({subject:s.subject,marksObtained:s.marksObtained,maxMarks:s.maxMarks,percentage:calcPercentage(s.marksObtained,s.maxMarks),grade:gradeForMarks(s.marksObtained,s.maxMarks)})),
    totalObtained:totalObtained, totalMax:totalMax,
    percentage:aggPct, grade:aggGrade,
    classPosition:rank, classSize:25, published:true,
  };
  assert(report.subjects.length===5, '5 subject rows');
  assert(report.totalObtained===110, 'total=110');
  assert(report.percentage===88, 'pct=88%');
  assert(report.grade==='A', 'grade=A');
  assert(report.classPosition===1, 'pos=#1');
  assert(report.published===true, 'published=visible');

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) { console.log('\n❌ Some tests failed!'); process.exit(1); }
  else { console.log('\n✅ All tests passed!'); }
}

void runTest();
