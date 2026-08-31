export function generateEmailHtml(schoolName: string, subject: string, type: string, contentHtml: string): string {
  return `
    <div style="font-family: 'Inter', 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; background-color: #f8fafc; padding: 20px;">
      <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 40px 32px; border-radius: 16px 16px 0 0; text-align: center; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
        <h1 style="color: white; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">${schoolName}</h1>
        <p style="color: #bfdbfe; margin: 12px 0 0; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">${type.replace('_', ' ')}</p>
      </div>
      <div style="padding: 40px 32px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 16px 16px; background: #ffffff; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05);">
        <h2 style="font-size: 22px; font-weight: 700; margin-top: 0; margin-bottom: 24px; color: #0f172a;">${subject}</h2>
        <div style="line-height: 1.8; color: #334155; font-size: 15px;">
          ${contentHtml}
        </div>
        <div style="margin-top: 40px; padding-top: 24px; border-top: 1px dashed #cbd5e1; text-align: center;">
          <p style="font-size: 13px; color: #64748b; margin: 0 0 8px 0; font-weight: 500;">Sent securely on behalf of ${schoolName}</p>
          <div style="display: inline-block; padding: 6px 12px; background: #f1f5f9; border-radius: 20px; font-size: 12px; color: #475569; font-weight: 600;">
            Powered by <span style="color: #2563eb; font-weight: 800;">KAUTIX</span>
          </div>
        </div>
      </div>
    </div>
  `;
}
