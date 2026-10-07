/** Starts GitHub Actions jobs with workflow_dispatch. */
import {need, opt} from './env.js';
import {HttpError, isRetryableStatus, withRetry} from '../../src/util.js';

export type Dispatcher = (jobId: string) => Promise<void>;

export const githubDispatch: Dispatcher = async (jobId) => {
  const repo = need('GITHUB_REPO'); // "owner/name"
  const workflow = opt('GITHUB_JOB_WORKFLOW', 'studio-job.yml');
  const ref = opt('GITHUB_REF_NAME_FOR_JOBS', 'main');
  await withRetry('GitHub dispatch', async () => {
    const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
      method: 'POST',
      headers: {Authorization: `Bearer ${need('GH_DISPATCH_TOKEN')}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json'},
      body: JSON.stringify({ref, inputs: {job_id: jobId}}),
    });
    if (res.status !== 204 && res.status !== 200) throw new HttpError(`GitHub dispatch: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`, res.status, isRetryableStatus(res.status));
  }, 3, 1500);
};

/** Starts a tick run now (GitHub's 15-minute schedule often runs hours late), e.g. right after a video is approved. */
export async function githubTickNow(): Promise<void> {
  const repo = need('GITHUB_REPO');
  const ref = opt('GITHUB_REF_NAME_FOR_JOBS', 'main');
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/studio-tick.yml/dispatches`, {
    method: 'POST',
    headers: {Authorization: `Bearer ${need('GH_DISPATCH_TOKEN')}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json'},
    body: JSON.stringify({ref}),
  });
  if (res.status !== 204 && res.status !== 200) throw new Error(`GitHub tick dispatch: HTTP ${res.status}`);
}
