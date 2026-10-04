import crypto from 'node:crypto';

console.log('Your new TOKEN_ENCRYPTION_KEY (keep it secret, save it in .env AND in GitHub secrets):\n');
console.log(crypto.randomBytes(32).toString('hex'));
