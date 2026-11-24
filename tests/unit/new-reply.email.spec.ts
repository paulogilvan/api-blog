import { describe, expect, it } from 'vitest';
import { buildNewReplyEmail } from '../../src/emails/new-reply.email.ts';

const data = {
  recipientName: 'John Doe',
  replierName: 'Jane Roe',
  postTitle: 'My first post',
  replyContent: 'Great post!',
};

describe('buildNewReplyEmail', () => {
  it('uses the contract subject with the post title', () => {
    expect(buildNewReplyEmail(data).subject).toBe('New reply on "My first post"');
  });

  it('includes the replier name, post title and reply text in the text version', () => {
    const { text } = buildNewReplyEmail(data);

    expect(text).toContain('Jane Roe');
    expect(text).toContain('My first post');
    expect(text).toContain('Great post!');
    expect(text).toContain('Hi John Doe');
  });

  it('includes the same information in the html version', () => {
    const { html } = buildNewReplyEmail(data);

    expect(html).toContain('Jane Roe');
    expect(html).toContain('My first post');
    expect(html).toContain('Great post!');
    expect(html).toContain('Hi John Doe');
  });

  it('escapes user-provided text in the html version', () => {
    const { html } = buildNewReplyEmail({
      recipientName: '<b>John</b>',
      replierName: '<script>alert(1)</script>',
      postTitle: 'Tom & "Jerry"',
      replyContent: `<img src=x onerror='alert(1)'>`,
    });

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>John');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Tom &amp; &quot;Jerry&quot;');
    expect(html).toContain('&lt;img src=x onerror=&#39;alert(1)&#39;&gt;');
  });

  it('keeps the text version unescaped (plain text is not html)', () => {
    const { text } = buildNewReplyEmail({ ...data, postTitle: 'Tom & "Jerry"' });

    expect(text).toContain('Tom & "Jerry"');
  });

  it('keeps line breaks of the reply in the html version', () => {
    const { html } = buildNewReplyEmail({ ...data, replyContent: 'line 1\nline 2' });

    expect(html).toContain('line 1<br>line 2');
  });

  it('collapses line breaks in the subject (no header injection)', () => {
    const { subject } = buildNewReplyEmail({
      ...data,
      postTitle: 'Title\r\nBcc: victim@example.com',
    });

    expect(subject).not.toMatch(/[\r\n]/);
    expect(subject).toBe('New reply on "Title Bcc: victim@example.com"');
  });
});
