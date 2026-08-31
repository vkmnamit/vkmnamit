import { supabaseAdmin } from '../config/supabase';
import { createStudentAdmission } from './ai-actions.service';

export type WorkflowStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

interface WorkflowStep {
  key: string;
  title: string;
  confirmationRequired: boolean;
}

export interface WorkflowExecutionContext {
  workflow: any;
  input: Record<string, unknown>;
  previousResults: Record<string, unknown>;
}

export interface WorkflowDefinitionStep {
  key: string;
  dependsOn?: string[];
  execute: (context: WorkflowExecutionContext) => Promise<Record<string, unknown> | void>;
  rollback?: (context: WorkflowExecutionContext, result: Record<string, unknown>) => Promise<void>;
}

export interface WorkflowDefinition {
  type: string;
  steps: WorkflowDefinitionStep[];
}

/** Durable workflow state used by AI actions that span more than one ERP operation. */
class AIWorkflowService {
  private definitions = new Map<string, WorkflowDefinition>();

  registerDefinition(definition: WorkflowDefinition) {
    this.definitions.set(definition.type, definition);
  }

  async createAdmissionPlan(params: {
    schoolId: string;
    userId: string;
    sessionId?: string;
    studentName: string;
    sectionId: string;
    createParent: boolean;
    generateAdmissionFee: boolean;
    admissionPayload?: Record<string, unknown>;
  }) {
    const steps: WorkflowStep[] = [
      { key: 'validate_admission', title: 'Validate student details and section access', confirmationRequired: false },
      { key: 'create_student', title: 'Create the student record and login', confirmationRequired: true },
      ...(params.createParent ? [{ key: 'link_parent', title: 'Create or link the parent account', confirmationRequired: true }] : []),
      ...(params.generateAdmissionFee ? [{ key: 'generate_admission_fee', title: 'Generate the admission fee record', confirmationRequired: true }] : []),
      { key: 'verify_admission', title: 'Verify the completed admission and summarize the result', confirmationRequired: false },
    ];

    const { data: workflow, error } = await supabaseAdmin
      .from('ai_workflows')
      .insert({
        school_id: params.schoolId,
        user_id: params.userId,
        session_id: params.sessionId || null,
        workflow_type: 'student_admission',
        goal: `Admit ${params.studentName}`,
        status: 'planned',
        confirmation_required: true,
        input: {
          sectionId: params.sectionId,
          createParent: params.createParent,
          generateAdmissionFee: params.generateAdmissionFee,
          admissionPayload: params.admissionPayload || null,
        },
      })
      .select('id')
      .single();
    if (error) throw error;

    const { error: stepsError } = await supabaseAdmin.from('ai_workflow_steps').insert(
      steps.map((step, index) => ({
        workflow_id: workflow.id,
        step_key: step.key,
        title: step.title,
        position: index + 1,
        status: 'pending',
        confirmation_required: step.confirmationRequired,
      })),
    );
    if (stepsError) throw stepsError;

    return { workflowId: workflow.id, status: 'planned', steps: steps.map(({ title, confirmationRequired }) => ({ title, confirmationRequired })) };
  }

  async markStep(params: { workflowId: string; stepKey: string; status: WorkflowStepStatus; error?: string }) {
    const patch: Record<string, unknown> = { status: params.status, error: params.error || null };
    if (params.status === 'running') patch.started_at = new Date().toISOString();
    if (params.status === 'completed' || params.status === 'failed' || params.status === 'skipped') patch.completed_at = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from('ai_workflow_steps')
      .update(patch)
      .eq('workflow_id', params.workflowId)
      .eq('step_key', params.stepKey);
    if (error) throw error;
  }

  async execute(workflowId: string) {
    const workflow = await this.loadWorkflow(workflowId);
    if (workflow.status === 'completed' || workflow.status === 'cancelled') return this.getProgress(workflowId);

    const definition = this.definitions.get(workflow.workflow_type);
    if (!definition) throw new Error(`No executor is registered for workflow type ${workflow.workflow_type}.`);

    await supabaseAdmin.from('ai_workflows').update({ status: 'running', last_error: null, updated_at: new Date().toISOString() }).eq('id', workflowId);
    const results: Record<string, any> = Object.fromEntries(
      workflow.steps.filter((step: any) => step.status === 'completed').map((step: any) => [step.step_key, step.result || {}]),
    );

    for (const step of workflow.steps) {
      if (step.status === 'completed' || step.status === 'skipped') continue;
      const handler = definition.steps.find((candidate) => candidate.key === step.step_key);
      if (!handler) throw new Error(`Workflow definition is missing step ${step.step_key}.`);
      const dependencies = step.depends_on || handler.dependsOn || [];
      if (dependencies.some((dependency: string) => !results[dependency])) {
        await this.fail(workflowId, step.step_key, `Waiting for required step: ${dependencies.filter((dependency: string) => !results[dependency]).join(', ')}`);
        return this.getProgress(workflowId);
      }

      await this.markStep({ workflowId, stepKey: step.step_key, status: 'running' });
      try {
        const result = await handler.execute({ workflow, input: workflow.input || {}, previousResults: results }) || {};
        results[step.step_key] = result;
        await supabaseAdmin.from('ai_workflow_steps').update({
          status: 'completed', result, error: null, completed_at: new Date().toISOString(),
        }).eq('workflow_id', workflowId).eq('step_key', step.step_key);
      } catch (error: any) {
        await this.fail(workflowId, step.step_key, error.message || 'Workflow step failed');
        return this.getProgress(workflowId);
      }
    }

    await supabaseAdmin.from('ai_workflows').update({ status: 'completed', result: results, updated_at: new Date().toISOString() }).eq('id', workflowId);
    return this.getProgress(workflowId);
  }

  async retry(workflowId: string) {
    const workflow = await this.loadWorkflow(workflowId);
    if (workflow.status !== 'failed') throw new Error('Only failed workflows can be retried.');
    const failedStep = workflow.steps.find((step: any) => step.status === 'failed');
    if (!failedStep) throw new Error('No failed step is available to retry.');
    if ((failedStep.retry_count || 0) >= (failedStep.max_retries || 3)) {
      throw new Error('This workflow step has reached its retry limit. Review the error or roll back reversible steps.');
    }
    await supabaseAdmin.from('ai_workflow_steps').update({
      status: 'pending', error: null, started_at: null, completed_at: null, retry_count: (failedStep.retry_count || 0) + 1,
    }).eq('id', failedStep.id);
    return this.execute(workflowId);
  }

  async rollback(workflowId: string) {
    const workflow = await this.loadWorkflow(workflowId);
    const definition = this.definitions.get(workflow.workflow_type);
    if (!definition) throw new Error(`No executor is registered for workflow type ${workflow.workflow_type}.`);
    const results = Object.fromEntries(workflow.steps.map((step: any) => [step.step_key, step.result || {}]));

    for (const step of [...workflow.steps].reverse()) {
      if (step.status !== 'completed') continue;
      const handler = definition.steps.find((candidate) => candidate.key === step.step_key);
      if (!handler?.rollback) continue;
      try {
        await handler.rollback({ workflow, input: workflow.input || {}, previousResults: results }, step.result || {});
        await supabaseAdmin.from('ai_workflow_steps').update({ status: 'skipped', error: 'Rolled back', completed_at: new Date().toISOString() }).eq('id', step.id);
      } catch (error: any) {
        await supabaseAdmin.from('ai_workflows').update({ status: 'failed', last_error: `Rollback failed: ${error.message}`, updated_at: new Date().toISOString() }).eq('id', workflowId);
        throw error;
      }
    }
    await supabaseAdmin.from('ai_workflows').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', workflowId);
    return this.getProgress(workflowId);
  }

  async getProgress(workflowId: string) {
    const workflow = await this.loadWorkflow(workflowId);
    return {
      status: workflow.status,
      goal: workflow.goal,
      lastError: workflow.last_error,
      steps: workflow.steps.map((step: any) => ({ key: step.step_key, title: step.title, status: step.status, error: step.error })),
    };
  }

  private async fail(workflowId: string, stepKey: string, error: string) {
    await supabaseAdmin.from('ai_workflow_steps').update({ status: 'failed', error, completed_at: new Date().toISOString() }).eq('workflow_id', workflowId).eq('step_key', stepKey);
    await supabaseAdmin.from('ai_workflows').update({ status: 'failed', last_error: error, updated_at: new Date().toISOString() }).eq('id', workflowId);
  }

  private async loadWorkflow(workflowId: string) {
    const { data, error } = await supabaseAdmin
      .from('ai_workflows')
      .select('*, steps:ai_workflow_steps(*)')
      .eq('id', workflowId)
      .single();
    if (error || !data) throw new Error('Workflow not found.');
    return { ...data, steps: [...((data as any).steps || [])].sort((a: any, b: any) => a.position - b.position) } as any;
  }
}

export const aiWorkflowService = new AIWorkflowService();

aiWorkflowService.registerDefinition({
  type: 'student_admission',
  steps: [
    {
      key: 'validate_admission',
      async execute({ workflow, input }) {
        const payload = input.admissionPayload as Record<string, unknown> | undefined;
        const sectionId = payload?.sectionId || input.sectionId;
        if (!sectionId) throw new Error('An admission section is required.');
        const { data: section } = await supabaseAdmin
          .from('sections')
          .select('id, class:classes!inner(school_id)')
          .eq('id', sectionId as string)
          .eq('classes.school_id', workflow.school_id)
          .maybeSingle();
        if (!section) throw new Error('The selected section is outside this school.');
        return { validated: true };
      },
    },
    {
      key: 'create_student',
      dependsOn: ['validate_admission'],
      async execute({ workflow, input }) {
        const payload = input.admissionPayload as Record<string, unknown> | undefined;
        if (!payload) throw new Error('Complete admission details are required before execution.');
        return createStudentAdmission({ schoolId: workflow.school_id, adminId: workflow.user_id, payload });
      },
    },
    {
      key: 'link_parent',
      dependsOn: ['create_student'],
      async execute() {
        return { handledBy: 'student_admission_adapter' };
      },
    },
    {
      key: 'generate_admission_fee',
      dependsOn: ['create_student'],
      async execute() {
        return { handledBy: 'student_admission_adapter' };
      },
    },
    {
      key: 'verify_admission',
      dependsOn: ['create_student'],
      async execute({ workflow, previousResults }) {
        const createdStudent = previousResults.create_student as { id?: string; admission_number?: string } | undefined;
        if (!createdStudent?.id) throw new Error('The student creation step did not return a student record.');

        const { data: student, error } = await supabaseAdmin
          .from('students')
          .select('id, admission_number, user:users(first_name, last_name), section:sections(name, class:classes(name))')
          .eq('id', createdStudent.id)
          .eq('school_id', workflow.school_id)
          .maybeSingle();
        if (error || !student) throw new Error('The student record could not be verified after admission.');

        return { verified: true, student };
      },
    },
  ],
});
