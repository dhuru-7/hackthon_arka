import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from './firebase';

const COLLECTION_NAME = 'render_errors';

// Session deduplication to avoid flooding Firestore if the same broken code re-renders
const reportedErrorKeys = new Set();

/**
 * Fire-and-forget telemetry logger for Mermaid render failures.
 * Never throws, never awaits on the critical path, 0% UX/render impact.
 */
export function reportRenderError({
  mermaidCode,
  errorMessage,
  prompt,
  diagramType,
  repairAttempt = 0,
  repairSucceeded = false,
  repairedCode = null,
  source = 'render',
  layoutEngine = 'elk',
  isUserSyntax = false,
}) {
  if (!mermaidCode || !errorMessage) return;

  // Do not record user-written syntax errors (manual code edits in the editor)
  if (isUserSyntax || source === 'user_manual' || source === 'user_editor' || source === 'user_syntax') {
    return;
  }

  const dedupeKey = `${mermaidCode.trim()}::${errorMessage.trim()}`;
  if (reportedErrorKeys.has(dedupeKey)) return;
  reportedErrorKeys.add(dedupeKey);

  // Cap deduplication set memory
  if (reportedErrorKeys.size > 200) {
    reportedErrorKeys.clear();
    reportedErrorKeys.add(dedupeKey);
  }

  // Pure non-blocking execution
  setTimeout(async () => {
    try {
      const payload = {
        mermaid_code: String(mermaidCode).slice(0, 16000),
        error_message: String(errorMessage).slice(0, 2000),
        prompt: prompt ? String(prompt).slice(0, 4000) : null,
        diagram_type: diagramType || null,
        repair_attempt: Number(repairAttempt) || 0,
        repair_succeeded: Boolean(repairSucceeded),
        repaired_code: repairedCode ? String(repairedCode).slice(0, 16000) : null,
        source: String(source),
        layout_engine: String(layoutEngine),
        uid: auth?.currentUser?.uid || null,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        viewport: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : null,
        mermaid_version: '12.0.0',
        created_at: serverTimestamp(),
      };

      await addDoc(collection(db, COLLECTION_NAME), payload);
    } catch (err) {
      // Telemetry should never affect user experience
      console.debug('[Telemetry] Render error record skipped:', err?.message || err);
    }
  }, 0);
}
