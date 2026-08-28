import { Link } from 'react-router';
import { LandingNavbar } from '../components/layout/LandingNavbar';

type LegalDocument = 'overview' | 'privacy' | 'terms' | 'deletion';

interface LegalPageProps {
  document?: LegalDocument;
}

const legalSections = {
  terms: {
    title: 'Terms and Conditions',
    intro: 'These Terms and Conditions govern access to and use of the Kautix school management platform.',
    sections: [
      ['Acceptance and authority', 'By creating an account or using Kautix on behalf of a school, you confirm that you are authorized to act for that institution and agree to these terms.'],
      ['Platform access', 'Kautix provides tools for school administration, communication, academic workflows, fees, and related services. Access is limited to the features and permissions assigned to your account.'],
      ['Account responsibility', 'Keep login credentials confidential and notify your school administrator promptly if you suspect unauthorized access. Institutions are responsible for managing their users, roles, and permissions.'],
      ['Acceptable use', 'You must not misuse the platform, bypass access controls, upload unlawful content, interfere with the service, or access information that is not assigned to you.'],
      ['School data', 'The institution remains responsible for the accuracy, legality, and permissions connected to the data it enters into Kautix.'],
      ['AI-assisted features', 'AI outputs may assist with school workflows, but they should be reviewed by an authorized person before any consequential decision or action is taken.'],
      ['Availability and changes', 'We may update, maintain, or improve the platform. Where reasonably possible, material service changes will be communicated through the platform or the institution contact.'],
      ['Suspension or termination', 'Access may be suspended or terminated where necessary to protect users, data, the service, or to address a breach of these terms.'],
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    intro: 'This policy explains how Kautix processes personal and school information while providing its school management platform.',
    sections: [
      ['Information we process', 'This can include account details, contact information, academic records, attendance, fee and payment records, communication records, and technical usage information required to operate the platform.'],
      ['Why we process information', 'We process information to provide requested services, authenticate users, apply role-based access, maintain security, support school operations, and improve reliability.'],
      ['School control of data', 'Schools are responsible for deciding which student, parent, teacher, and operational data they enter. Kautix processes that data to provide the service under the school’s instructions.'],
      ['Access and sharing', 'Information is not sold. It is shared only with authorized users, service providers needed to operate Kautix, or where required by applicable law.'],
      ['Security', 'We use technical and organizational controls such as authenticated access, role-based permissions, encrypted transport, and activity logging. No internet service can guarantee absolute security.'],
      ['Retention', 'Information is retained only for as long as needed to provide the service, meet legitimate operational requirements, or comply with applicable obligations.'],
      ['Your choices', 'Contact your school administrator to request access, correction, or deletion of information in the school account. Schools may contact Kautix through the support channel for service-related privacy requests.'],
      ['Policy changes', 'This policy may be updated as the service or applicable requirements change. The current version will always be available on this page.'],
    ],
  },
  deletion: {
    title: 'Data Deletion Request',
    intro: 'Kautix gives schools and account holders a clear way to request deletion of personal information held in the platform.',
    sections: [
      ['Submit a request', 'Use the Kautix Contact page and select or write the subject “Data deletion request”. Include the name of the school, the account email or student identifier, and the information you want deleted.'],
      ['Who can request deletion', 'A school administrator may request deletion of institution-managed records. Students, parents, and staff may request deletion or correction of their own account information through their school administrator or directly through the Contact page.'],
      ['Verification', 'To protect school records, Kautix may ask for information needed to verify the requester’s identity and authority before acting on a request.'],
      ['What happens next', 'We review the request, confirm the affected records, and coordinate with the school where the school controls the relevant data. We will explain if a record must be retained for a legitimate operational or legal reason.'],
      ['Account access', 'Deleting an account may remove access to Kautix. Schools should export records they need before an approved deletion is completed.'],
    ],
  },
};

export function LegalPage({ document = 'overview' }: LegalPageProps) {
  const selected = document === 'overview' ? null : legalSections[document];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-blue-500/30 flex flex-col w-full overflow-x-hidden">
      <LandingNavbar />

      <section className="w-full flex-grow px-4 py-12 sm:px-6 lg:px-10 lg:py-16">
        <div className="w-full max-w-5xl mx-auto">
          {selected ? (
            <article className="w-full bg-white border border-slate-200 shadow-sm p-6 sm:p-10 lg:p-14">
              <Link to="/legal" className="inline-flex text-sm font-semibold text-blue-700 hover:text-blue-900 mb-8">Legal centre</Link>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Last updated: July 20, 2026</p>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-normal text-slate-950">{selected.title}</h1>
              <p className="mt-5 text-base leading-7 text-slate-600">{selected.intro}</p>
              <div className="mt-10 space-y-8">
                {selected.sections.map(([heading, content], index) => (
                  <section key={heading}>
                    <h2 className="text-lg font-bold tracking-normal text-slate-900">{index + 1}. {heading}</h2>
                    <p className="mt-2 leading-7 text-slate-600">{content}</p>
                  </section>
                ))}
              </div>
            </article>
          ) : (
            <div className="w-full bg-white border border-slate-200 shadow-sm p-6 sm:p-10 lg:p-14">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Kautix</p>
              <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-normal text-slate-950">Legal centre</h1>
              <p className="mt-4 max-w-2xl leading-7 text-slate-600">Read the current terms governing the service and how information is handled in Kautix.</p>
              <div className="mt-10 grid gap-4 sm:grid-cols-2">
                <Link to="/terms" className="block border border-slate-200 p-6 hover:border-blue-500 hover:bg-blue-50 transition-colors">
                  <h2 className="text-lg font-bold tracking-normal text-slate-900">Terms and Conditions</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">Service access, account responsibilities, acceptable use, and AI-assisted workflows.</p>
                </Link>
                <Link to="/privacy-policy" className="block border border-slate-200 p-6 hover:border-blue-500 hover:bg-blue-50 transition-colors">
                  <h2 className="text-lg font-bold tracking-normal text-slate-900">Privacy Policy</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">The information Kautix processes, why it is used, and how it is protected.</p>
                </Link>
                <Link to="/data-deletion" className="block border border-slate-200 p-6 hover:border-blue-500 hover:bg-blue-50 transition-colors">
                  <h2 className="text-lg font-bold tracking-normal text-slate-900">Data Deletion</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">How an authorized school or account holder can request deletion of personal information.</p>
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>

      <footer className="bg-[#0a0a0a] py-8 px-4 sm:px-6 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between">
           <Link to="/" className="flex items-center">
             <img src="https://res.cloudinary.com/dgrrdy6sk/image/upload/v1777535903/ChatGPT_Image_Apr_30__2026__11_33_17_AM-removebg-preview_vi9twl.png" alt="Kautix Logo" className="h-10 w-auto brightness-0 invert" />
           </Link>
           <div className="flex items-center gap-5 text-xs text-slate-400">
             <Link to="/terms" className="hover:text-white">Terms</Link>
             <Link to="/privacy-policy" className="hover:text-white">Privacy</Link>
             <Link to="/data-deletion" className="hover:text-white">Data deletion</Link>
             <p>&copy; 2026 Kautix. All rights reserved.</p>
           </div>
        </div>
      </footer>
    </div>
  );
}
