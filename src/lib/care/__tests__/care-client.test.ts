import { inviteLink, tokenFromInput } from '../care-client';

describe('invite links', () => {
  const token = 'Ab_-'.repeat(20);

  it('round-trips a token through a link', () => {
    const link = inviteLink('https://app.dosely.example/network/provider', token);
    expect(link).toBe(`https://app.dosely.example/network/provider?redeem=${token}`);
    expect(tokenFromInput(link)).toBe(token);
    expect(tokenFromInput(inviteLink('dosely://network/provider?x=1', token))).toBe(token);
  });

  it('accepts a bare token and rejects junk', () => {
    expect(tokenFromInput(`  ${token}\n`)).toBe(token);
    expect(tokenFromInput('hello')).toBeNull();
    expect(tokenFromInput('https://evil.example/?redeem=<script>')).toBeNull();
  });
});
