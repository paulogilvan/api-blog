import { describe, expect, it, vi } from 'vitest';
import { NEW_REPLY_EMAIL_JOB } from '../../src/queues/emails/names.ts';
import { createEmailProcessor } from '../../src/queues/emails/processor.ts';
import type { NewReplyEmailJob } from '../../src/repositories/email-job.repository.ts';
import type { Mailer } from '../../src/utils/mailer.ts';

const data: NewReplyEmailJob = {
  to: 'john@example.com',
  recipientName: 'John Doe',
  replierName: 'Jane Roe',
  postTitle: 'My post',
  replyContent: 'Great post!',
};

function setup(send = vi.fn<Mailer['send']>(async () => {})) {
  return { process: createEmailProcessor({ send }), send };
}

describe('e-mail queue processor', () => {
  it('builds the new reply e-mail from the job payload and sends it', async () => {
    const { process, send } = setup();

    await process({ name: NEW_REPLY_EMAIL_JOB, data });

    expect(send).toHaveBeenCalledOnce();
    const message = send.mock.calls[0][0];
    expect(message.to).toBe('john@example.com');
    expect(message.subject).toBe('New reply on "My post"');
    expect(message.text).toContain('Hi John Doe,');
    expect(message.text).toContain('Jane Roe');
    expect(message.text).toContain('Great post!');
    expect(message.html).toContain('Jane Roe');
  });

  it('rethrows a sending failure so the queue retries the job', async () => {
    const { process } = setup(
      vi.fn<Mailer['send']>(async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:1026');
      }),
    );

    await expect(process({ name: NEW_REPLY_EMAIL_JOB, data })).rejects.toThrow('ECONNREFUSED');
  });

  it('rejects unknown job names without sending', async () => {
    const { process, send } = setup();

    await expect(process({ name: 'unknown', data })).rejects.toThrow('Unknown e-mail job');
    expect(send).not.toHaveBeenCalled();
  });
});
