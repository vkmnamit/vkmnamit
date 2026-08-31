import { Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { uploadToS3, buildExamPaperKey } from '../config/s3';

// ============================================
// EXAM PAPER TEMPLATES (Admin-configured structures)
// ============================================

// Create exam paper template
export async function createExamPaperTemplate(req: AuthenticatedRequest, res: Response) {
  try {
    const {
      name, classId, subjectId, academicYearId, totalMarks, durationMinutes,
      instructions, generalInstructions, sections
    } = req.body;

    if (!name || !classId || !subjectId || !totalMarks) {
      return res.status(400).json({ error: 'Name, class, subject, and total marks are required' });
    }

    const { data: template, error } = await supabaseAdmin
      .from('exam_paper_templates')
      .insert({
        school_id: req.user!.school_id,
        name,
        class_id: classId,
        subject_id: subjectId,
        academic_year_id: academicYearId || null,
        total_marks: totalMarks,
        duration_minutes: durationMinutes || 180,
        instructions: instructions || null,
        general_instructions: generalInstructions || null,
        created_by: req.user!.id
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    // Create sections if provided
    if (sections && Array.isArray(sections)) {
      const sectionInserts = sections.map((sec: any) => ({
        template_id: template.id,
        section_name: sec.sectionName,
        section_title: sec.sectionTitle || null,
        instructions: sec.instructions || null,
        section_order: sec.sectionOrder,
        total_marks: sec.totalMarks
      }));

      await supabaseAdmin.from('exam_paper_sections').insert(sectionInserts);
    }

    return res.status(201).json(template);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to create exam paper template' });
  }
}

// Get exam paper templates
export async function getExamPaperTemplates(req: AuthenticatedRequest, res: Response) {
  try {
    const { classId, subjectId } = req.query;

    let query = supabaseAdmin
      .from('exam_paper_templates')
      .select(`
        *,
        class:classes(name, grade),
        subject:subjects(name, code),
        sections:exam_paper_sections(*)
      `)
      .eq('school_id', req.user!.school_id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (classId && classId !== 'all') query = query.eq('class_id', classId as string);
    if (subjectId && subjectId !== 'all') query = query.eq('subject_id', subjectId as string);

    const { data, error } = await query;

    if (error) return res.status(400).json({ error: error.message });
    return res.json(data || []);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch exam paper templates' });
  }
}

// ============================================
// S3 FILE UPLOAD (images for questions / papers)
// ============================================

// Upload an image (base64 data URL) to S3 and return the public URL
export async function uploadExamPaperImage(req: AuthenticatedRequest, res: Response) {
  try {
    const { dataUrl, filename, type } = req.body;

    if (!dataUrl) {
      return res.status(400).json({ error: 'dataUrl is required' });
    }

    // Parse base64 data URL: "data:image/png;base64,...."
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ error: 'Invalid data URL format' });
    }

    const contentType = match[1];
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, 'base64');

    // Limit to 5MB per image
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(413).json({ error: 'Image too large. Maximum size is 5MB.' });
    }

    const safeName = filename || `image-${Date.now()}.png`;
    const key = buildExamPaperKey(req.user!.school_id, type || 'images', safeName);
    const url = await uploadToS3(key, buffer, contentType);

    return res.status(201).json({ url, key });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to upload image' });
  }
}

// ============================================
// QUESTIONS BANK
// ============================================

// Create question
export async function createQuestion(req: AuthenticatedRequest, res: Response) {
  try {
    const {
      subjectId, classId, questionText, questionType, questionImageUrl,
      options, correctAnswer, marks, difficulty, chapter, topic, tags
    } = req.body;

    if (!subjectId || !classId || !questionText || !marks) {
      return res.status(400).json({ error: 'Subject, class, question text, and marks are required' });
    }

    const { data, error } = await supabaseAdmin
      .from('exam_questions')
      .insert({
        school_id: req.user!.school_id,
        subject_id: subjectId,
        class_id: classId,
        question_text: questionText,
        question_type: questionType || 'text',
        question_image_url: questionImageUrl || null,
        options: options || null,
        correct_answer: correctAnswer || null,
        marks: marks,
        difficulty: difficulty || 'medium',
        chapter: chapter || null,
        topic: topic || null,
        tags: tags || [],
        created_by: req.user!.id
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json(data);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to create question' });
  }
}

// Get questions
export async function getQuestions(req: AuthenticatedRequest, res: Response) {
  try {
    const { subjectId, classId, chapter, difficulty, search } = req.query;

    let query = supabaseAdmin
      .from('exam_questions')
      .select('*')
      .eq('school_id', req.user!.school_id)
      .order('created_at', { ascending: false });

    if (subjectId && subjectId !== 'all') query = query.eq('subject_id', subjectId as string);
    if (classId && classId !== 'all') query = query.eq('class_id', classId as string);
    if (chapter && chapter !== 'all') query = query.ilike('chapter', `%${chapter}%`);
    if (difficulty && difficulty !== 'all') query = query.eq('difficulty', difficulty as string);

    if (search) {
      query = query.ilike('question_text', `%${search}%`);
    }

    const { data, error } = await query;

    if (error) return res.status(400).json({ error: error.message });
    return res.json(data || []);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch questions' });
  }
}

// ============================================
// EXAM PAPERS (Generated papers)
// ============================================

// Create exam paper
export async function createExamPaper(req: AuthenticatedRequest, res: Response) {
  try {
    const {
      templateId, examId, paperCode, paperTitle, examType, totalMarks, durationMinutes, questions, status
    } = req.body;

    if (!templateId || !paperCode || !totalMarks || !questions || !Array.isArray(questions)) {
      return res.status(400).json({ error: 'Template, paper code, total marks, and questions are required' });
    }

    // Create paper
    const { data: paper, error } = await supabaseAdmin
      .from('exam_papers')
      .insert({
        school_id: req.user!.school_id,
        template_id: templateId,
        exam_id: examId || null,
        paper_code: paperCode,
        title: paperTitle || null,
        exam_type: examType || null,
        total_marks: totalMarks,
        duration_minutes: durationMinutes || 180,
        status: status || 'draft',
        created_by: req.user!.id
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    const toUuidOrNull = (val: any) => {
      if (!val) return null;
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      return uuidRegex.test(String(val)) ? String(val) : null;
    };

    // Add questions to paper
    if (questions.length > 0) {
      const questionInserts = questions.map((q: any, index: number) => {
        return {
          paper_id: paper.id,
          section_id: toUuidOrNull(q.sectionId),
          question_id: toUuidOrNull(q.questionId),
          question_order: index + 1,
          custom_question_text: q.customQuestionText || null,
          custom_marks: q.customMarks || null,
          question_type: q.questionType || 'short',
          options: q.options || null,
          image_url: q.imageUrl || null,
        };
      });

      const { error: insertError } = await supabaseAdmin.from('exam_paper_questions').insert(questionInserts);
      if (insertError) {
        // Cleanup the created paper if questions insert failed
        await supabaseAdmin.from('exam_papers').delete().eq('id', paper.id);
        return res.status(400).json({ error: `Failed to insert questions: ${insertError.message}` });
      }
    }

    return res.status(201).json(paper);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to create exam paper' });
  }
}


// Get exam papers
export async function getExamPapers(req: AuthenticatedRequest, res: Response) {
  try {
    const { templateId, examId } = req.query;

    let query = supabaseAdmin
      .from('exam_papers')
      .select(`
        *,
        template:exam_paper_templates(
          *,
          sections:exam_paper_sections(*)
        ),
        exam:exams(
          *,
          class:classes(name, grade),
          subject:subjects(name, code)
        ),
        questions:exam_paper_questions(
          *,
          question:exam_questions(*),
          section:exam_paper_sections(*)
        )
      `)
      .eq('school_id', req.user!.school_id)
      .order('created_at', { ascending: false });

    if (templateId && templateId !== 'all') query = query.eq('template_id', templateId as string);
    if (examId && examId !== 'all') query = query.eq('exam_id', examId as string);

    const { data, error } = await query;

    if (error) return res.status(400).json({ error: error.message });
    return res.json(data || []);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch exam papers' });
  }
}

// ============================================
// HTML PAPER GENERATION
// ============================================

export async function generateExamPaperHTML(req: AuthenticatedRequest, res: Response) {
  try {
    const { paperId } = req.params;

    // Fetch paper with all related data
    const { data: paper, error } = await supabaseAdmin
      .from('exam_papers')
      .select(`
        *,
        template:exam_paper_templates(
          *,
          sections:exam_paper_sections(*)
        ),
        exam:exams(
          *,
          class:classes(name, grade),
          subject:subjects(name, code),
          exam_type:exam_types(name)
        ),
        questions:exam_paper_questions(
          *,
          question:exam_questions(*),
          section:exam_paper_sections(*)
        )
      `)
      .eq('id', paperId)
      .eq('school_id', req.user!.school_id)
      .single();

    if (error || !paper) {
      return res.status(404).json({ error: 'Exam paper not found' });
    }

    // Generate HTML
    const html = generatePaperHTML(paper);

    return res.send(html);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to generate exam paper HTML' });
  }
}

// Helper function to generate HTML
function generatePaperHTML(paper: any): string {
  const template = paper.template;
  const exam = paper.exam;
  const schoolName = 'Your School Name'; // TODO: Fetch from school settings

  // Get print settings
  const printSettings = paper.print_settings || {
    showHeader: true,
    showFooter: true,
    showPageNumbers: true,
    showWatermark: false,
    showSignature: false,
    showInstructions: true
  };

  // Group questions by section
  const questionsBySection: Record<string, any[]> = {};
  paper.questions?.forEach((pq: any) => {
    const sectionId = pq.section_id || 'general';
    if (!questionsBySection[sectionId]) {
      questionsBySection[sectionId] = [];
    }
    questionsBySection[sectionId].push({
      ...pq.question,
      customText: pq.custom_question_text,
      customMarks: pq.custom_marks,
      order: pq.question_order
    });
  });

  // Sort sections by order
  const sortedSections = template?.sections?.sort((a: any, b: any) => a.section_order - b.section_order) || [];

  let sectionsHTML = '';
  sortedSections.forEach((section: any) => {
    const questions = questionsBySection[section.id] || [];
    if (questions.length === 0) return;

    const sortedQuestions = questions.sort((a: any, b: any) => a.order - b.order);

    let questionsHTML = sortedQuestions.map((q: any, idx: number) => {
      const questionText = q.customText || q.question_text;
      const marks = q.customMarks || q.marks;

      if (q.question_type === 'mcq' && q.options) {
        const options = JSON.parse(q.options);
        const optionsHTML = Object.entries(options).map(([key, value]) =>
          `<div style="margin: 5px 0;">${key}) ${value}</div>`
        ).join('');

        return `
          <div style="margin-bottom: 15px; page-break-inside: avoid;">
            <div style="font-weight: bold;">${idx + 1}. ${questionText} [${marks} marks]</div>
            <div style="margin-left: 20px; margin-top: 8px;">
              ${optionsHTML}
            </div>
          </div>
        `;
      }

      return `
        <div style="margin-bottom: 15px; page-break-inside: avoid;">
          <div style="font-weight: bold;">${idx + 1}. ${questionText} [${marks} marks]</div>
        </div>
      `;
    }).join('');

    sectionsHTML += `
      <div style="margin-bottom: 25px;">
        <div style="background-color: #f0f0f0; padding: 10px; margin-bottom: 15px; font-weight: bold; font-size: 14px;">
          Section ${section.section_name}: ${section.section_title || ''} (${section.total_marks} marks)
        </div>
        ${section.instructions ? `<div style="font-style: italic; margin-bottom: 10px; font-size: 12px;">${section.instructions}</div>` : ''}
        <div style="margin-top: 10px;">
          ${questionsHTML}
        </div>
      </div>
    `;
  });

  // If no sections defined, show all questions
  if (sortedSections.length === 0 && paper.questions?.length > 0) {
    const sortedQuestions = paper.questions.sort((a: any, b: any) => a.question_order - b.question_order);
    sectionsHTML = sortedQuestions.map((pq: any, idx: number) => {
      const questionText = pq.custom_question_text || pq.question?.question_text;
      const marks = pq.custom_marks || pq.question?.marks;

      return `
        <div style="margin-bottom: 15px; page-break-inside: avoid;">
          <div style="font-weight: bold;">${idx + 1}. ${questionText} [${marks} marks]</div>
        </div>
      `;
    }).join('');
  }

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${template?.name || 'Exam Paper'} - ${paper.paper_code}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Times New Roman', Times, serif;
      padding: 40px;
      line-height: 1.6;
    }
    ${printSettings.showHeader ? `
    .header {
      text-align: center;
      border-bottom: 3px solid #000;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .school-name {
      font-size: 24px;
      font-weight: bold;
      margin-bottom: 10px;
    }
    .exam-title {
      font-size: 20px;
      font-weight: bold;
      margin: 10px 0;
    }
    .paper-info {
      display: flex;
      justify-content: space-between;
      margin-top: 20px;
      font-size: 14px;
    }
    ` : ''}
    ${printSettings.showInstructions && template?.general_instructions ? `
    .general-instructions {
      background-color: #f9f9f9;
      padding: 15px;
      margin-bottom: 25px;
      border: 1px solid #ddd;
    }
    .instructions-title {
      font-weight: bold;
      margin-bottom: 10px;
    }
    .instructions-list {
      margin-left: 20px;
      font-size: 13px;
    }
    ` : ''}
    .section {
      margin-bottom: 25px;
    }
    .section-header {
      background-color: #f0f0f0;
      padding: 10px;
      margin-bottom: 15px;
      font-weight: bold;
      font-size: 14px;
    }
    .question {
      margin-bottom: 15px;
      page-break-inside: avoid;
    }
    .question-text {
      font-weight: bold;
    }
    .options {
      margin-left: 20px;
      margin-top: 8px;
    }
    .option {
      margin: 5px 0;
    }
    ${printSettings.showWatermark ? `
    body::before {
      content: "DRAFT";
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 120px;
      color: rgba(255, 0, 0, 0.1);
      z-index: -1;
      pointer-events: none;
    }
    ` : ''}
    ${printSettings.showPageNumbers ? `
    @page {
      @bottom-center {
        content: "Page " counter(page);
        font-size: 12px;
      }
    }
    ` : ''}
    @media print {
      body {
        padding: 20px;
      }
      .no-print {
        display: none;
      }
    }
  </style>
</head>
<body>
  ${printSettings.showHeader ? `
  <div class="header">
    <div class="school-name">${schoolName}</div>
    <div class="exam-title">${template?.name || 'Examination'}</div>
    <div style="font-size: 16px; margin-top: 5px;">
      ${exam?.subject?.name || ''} - ${exam?.class?.name || ''}
    </div>
    <div class="paper-info">
      <div>Paper Code: ${paper.paper_code}</div>
      <div>Max Marks: ${paper.total_marks}</div>
      <div>Duration: ${paper.duration_minutes} minutes</div>
    </div>
  </div>
  ` : ''}

  ${printSettings.showInstructions && template?.general_instructions ? `
    <div class="general-instructions">
      <div class="instructions-title">General Instructions:</div>
      <div class="instructions-list">
        ${template.general_instructions.split('\n').map((line: string) => `<li>${line}</li>`).join('')}
      </div>
    </div>
  ` : ''}

  <div class="content">
    ${sectionsHTML}
  </div>

  ${printSettings.showSignature ? `
  <div style="margin-top: 50px; display: flex; justify-content: space-between;">
    <div>
      <p>_____________________</p>
      <p style="font-size: 12px; margin-top: 5px;">Examiner's Signature</p>
    </div>
  </div>
  ` : ''}

  <div class="no-print" style="margin-top: 30px; text-align: center;">
    <button onclick="window.print()" style="padding: 10px 30px; font-size: 14px; cursor: pointer;">
      Print / Save as PDF
    </button>
  </div>
</body>
</html>
  `;

  return html;
}

// ============================================
// BULK OPERATIONS
// ============================================

// Bulk import questions
export async function bulkImportQuestions(req: AuthenticatedRequest, res: Response) {
  try {
    const { questions } = req.body;

    if (!questions || !Array.isArray(questions)) {
      return res.status(400).json({ error: 'Questions array is required' });
    }

    const questionInserts = questions.map((q: any) => ({
      school_id: req.user!.school_id,
      subject_id: q.subjectId,
      class_id: q.classId,
      question_text: q.questionText,
      question_type: q.questionType || 'text',
      question_image_url: q.questionImageUrl || null,
      options: q.options || null,
      correct_answer: q.correctAnswer || null,
      marks: q.marks || 1,
      difficulty: q.difficulty || 'medium',
      chapter: q.chapter || null,
      topic: q.topic || null,
      tags: q.tags || [],
      created_by: req.user!.id
    }));

    const { data, error } = await supabaseAdmin
      .from('exam_questions')
      .insert(questionInserts)
      .select();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json({
      message: `Successfully imported ${data.length} questions`,
      count: data.length
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to import questions' });
  }
}

// ============================================
// PAPER MODERATION WORKFLOW
// ============================================

export async function updatePaperStatus(req: AuthenticatedRequest, res: Response) {
  try {
    const { paperId } = req.params;
    const { status, comments } = req.body;

    const validStatuses = ['draft', 'submitted', 'reviewed', 'approved', 'locked'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const updatePayload: any = { status };
    if (comments) updatePayload.comments = comments;
    if (status === 'reviewed' || status === 'approved') {
      updatePayload.reviewed_by = req.user!.id;
      updatePayload.reviewed_at = new Date().toISOString();
    }

    const { data, error } = await supabaseAdmin
      .from('exam_papers')
      .update(updatePayload)
      .eq('id', paperId)
      .eq('school_id', req.user!.school_id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to update paper status' });
  }
}

// ============================================
// DUPLICATE DETECTION
// ============================================

export async function checkDuplicateQuestions(req: AuthenticatedRequest, res: Response) {
  try {
    const { questionIds, paperId } = req.body;

    if (!questionIds || !Array.isArray(questionIds)) {
      return res.status(400).json({ error: 'Question IDs array is required' });
    }

    // Check if questions were used in other papers
    const { data: usageHistory, error } = await supabaseAdmin
      .from('question_usage_history')
      .select(`
        *,
        paper:exam_papers!inner(
          id,
          paper_code,
          created_at,
          exam:exams(name, date)
        )
      `)
      .in('question_id', questionIds)
      .neq('paper_id', paperId)
      .order('used_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });

    // Group by question ID
    const duplicates: Record<string, any[]> = {};
    usageHistory?.forEach((usage: any) => {
      if (!duplicates[usage.question_id]) {
        duplicates[usage.question_id] = [];
      }
      duplicates[usage.question_id].push({
        paperCode: usage.paper.paper_code,
        examName: usage.paper.exam?.name,
        examDate: usage.paper.exam?.date,
        usedAt: usage.used_at
      });
    });

    return res.json({
      hasDuplicates: Object.keys(duplicates).length > 0,
      duplicates
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to check duplicates' });
  }
}

// Track question usage when paper is created
export async function trackQuestionUsage(req: AuthenticatedRequest, res: Response) {
  try {
    const { paperId, questionIds, examId } = req.body;

    if (!paperId || !questionIds || !Array.isArray(questionIds)) {
      return res.status(400).json({ error: 'Paper ID and question IDs are required' });
    }

    const usageRecords = questionIds.map((qId: string) => ({
      question_id: qId,
      paper_id: paperId,
      exam_id: examId || null,
      used_at: new Date().toISOString()
    }));

    const { error } = await supabaseAdmin
      .from('question_usage_history')
      .insert(usageRecords);

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ message: 'Question usage tracked successfully' });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to track question usage' });
  }
}

// ============================================
// BLUEPRINT COMPLIANCE
// ============================================

export async function checkBlueprintCompliance(req: AuthenticatedRequest, res: Response) {
  try {
    const { templateId, questions } = req.body;

    // Get template with blueprint
    const { data: template, error } = await supabaseAdmin
      .from('exam_paper_templates')
      .select('blueprint, total_marks')
      .eq('id', templateId)
      .single();

    if (error || !template) {
      return res.status(400).json({ error: 'Template not found' });
    }

    const blueprint = template.blueprint || [];
    if (!blueprint || blueprint.length === 0) {
      return res.json({ compliant: true, message: 'No blueprint defined' });
    }

    // Calculate actual distribution
    const actualDistribution: Record<string, { count: number; marks: number; percentage: number }> = {};
    const totalMarks = template.total_marks;

    questions.forEach((q: any) => {
      const type = q.question_type || 'text';
      if (!actualDistribution[type]) {
        actualDistribution[type] = { count: 0, marks: 0, percentage: 0 };
      }
      actualDistribution[type].count++;
      actualDistribution[type].marks += q.customMarks || q.marks || 1;
    });

    // Calculate percentages
    Object.keys(actualDistribution).forEach(type => {
      actualDistribution[type].percentage = (actualDistribution[type].marks / totalMarks) * 100;
    });

    // Check compliance
    const complianceResults = blueprint.map((bp: any) => {
      const actual = actualDistribution[bp.type] || { count: 0, marks: 0, percentage: 0 };
      const diff = actual.percentage - bp.percentage;
      return {
        type: bp.type,
        targetPercentage: bp.percentage,
        actualPercentage: Math.round(actual.percentage * 100) / 100,
        actualMarks: actual.marks,
        actualCount: actual.count,
        compliant: Math.abs(diff) <= 5, // Within 5% tolerance
        diff: Math.round(diff * 100) / 100
      };
    });

    const isCompliant = complianceResults.every((r: any) => r.compliant);

    return res.json({
      compliant: isCompliant,
      blueprint: complianceResults,
      message: isCompliant ? 'Blueprint matched' : 'Blueprint does not match target distribution'
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to check blueprint compliance' });
  }
}


export async function updateExamPaperTemplate(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const {
      name, classId, subjectId, academicYearId, totalMarks, durationMinutes,
      instructions, generalInstructions, sections
    } = req.body;

    if (!name || !classId || !subjectId || !totalMarks) {
      return res.status(400).json({ error: 'Name, class, subject, and total marks are required' });
    }

    const { data: template, error } = await supabaseAdmin
      .from('exam_paper_templates')
      .update({
        name,
        class_id: classId,
        subject_id: subjectId,
        academic_year_id: academicYearId || null,
        total_marks: totalMarks,
        duration_minutes: durationMinutes || 180,
        instructions: instructions || null,
        general_instructions: generalInstructions || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('school_id', req.user!.school_id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    if (sections && Array.isArray(sections)) {
      await supabaseAdmin.from('exam_paper_sections').delete().eq('template_id', id);
      const sectionInserts = sections.map((sec: any) => ({
        template_id: id,
        section_name: sec.sectionName,
        section_title: sec.sectionTitle || null,
        instructions: sec.instructions || null,
        section_order: sec.sectionOrder,
        total_marks: sec.totalMarks
      }));
      await supabaseAdmin.from('exam_paper_sections').insert(sectionInserts);
    }

    return res.json(template);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

export async function deleteExamPaperTemplate(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const { error } = await supabaseAdmin
      .from('exam_paper_templates')
      .delete()
      .eq('id', id)
      .eq('school_id', req.user!.school_id);

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

export async function updateExamPaper(req: AuthenticatedRequest, res: Response) {
  try {
    const { paperId } = req.params;
    const { paperTitle, examType, totalMarks, questions, status } = req.body;

    // Update the paper itself
    const { data: paper, error: paperError } = await supabaseAdmin
      .from('exam_papers')
      .update({
        title: paperTitle,
        exam_type: examType,
        total_marks: totalMarks,
        status: status || 'draft',
        updated_at: new Date().toISOString()
      })
      .eq('id', paperId)
      .eq('school_id', req.user!.school_id)
      .select()
      .single();

    if (paperError) return res.status(400).json({ error: paperError.message });

    // Replace all questions
    if (questions && Array.isArray(questions)) {
      await supabaseAdmin.from('exam_paper_questions').delete().eq('paper_id', paperId);
      if (questions.length > 0) {
        const toUuidOrNull = (val: any) => {
          if (!val) return null;
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          return uuidRegex.test(String(val)) ? String(val) : null;
        };

        const inserts = questions.map((q: any) => {
          return {
            paper_id: paperId,
            question_id: toUuidOrNull(q.questionId),
            section_id: toUuidOrNull(q.sectionId),
            question_order: q.questionOrder,
            custom_marks: q.customMarks,
            custom_question_text: q.customQuestionText || null,
            question_type: q.questionType || 'short',
            options: q.options || null,
            image_url: q.imageUrl || null,
          };
        });
        const { error: insertError } = await supabaseAdmin.from('exam_paper_questions').insert(inserts);
        if (insertError) {
          return res.status(400).json({ error: `Failed to insert updated questions: ${insertError.message}` });
        }
      }
    }

    return res.json(paper);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
