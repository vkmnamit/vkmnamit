import { Router } from 'express';
import {
    createExamPaperTemplate,
    getExamPaperTemplates,
    updateExamPaperTemplate,
    deleteExamPaperTemplate,
    createQuestion,
    getQuestions,
    createExamPaper,
    updateExamPaper,
    getExamPapers,
    generateExamPaperHTML,
    bulkImportQuestions,
    updatePaperStatus,
    checkDuplicateQuestions,
    trackQuestionUsage,
    checkBlueprintCompliance,
    uploadExamPaperImage
} from '../controllers/exam-paper.controller';
import { authMiddleware, authorize } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication and teacher/admin roles
router.use(authMiddleware);
router.use(authorize('admin', 'teacher'));

// Exam Paper Templates
router.post('/templates', createExamPaperTemplate);
router.get('/templates', getExamPaperTemplates);
router.put('/templates/:id', updateExamPaperTemplate);
router.delete('/templates/:id', deleteExamPaperTemplate);

// File Uploads (images for questions / papers)
router.post('/upload', uploadExamPaperImage);

// Questions Bank
router.post('/questions', createQuestion);
router.get('/questions', getQuestions);
router.post('/questions/bulk-import', bulkImportQuestions);

// Exam Papers
router.post('/papers', createExamPaper);
router.put('/papers/:paperId', updateExamPaper);
router.get('/papers', getExamPapers);
router.get('/papers/:paperId/html', generateExamPaperHTML);

// Paper Moderation
router.patch('/papers/:paperId/status', updatePaperStatus);

// Duplicate Detection
router.post('/questions/check-duplicates', checkDuplicateQuestions);
router.post('/papers/:paperId/track-usage', trackQuestionUsage);

// Blueprint Compliance
router.post('/templates/check-blueprint', checkBlueprintCompliance);

export default router;