// `npm run admin:setup -- <username>`: replaces every admin with one new admin.
// The password is typed twice (hidden), never passed in argv. Prints the TOTP secret, the otpauth URI
// and a QR code for Google Authenticator. Exits with code 1 (and a message) on invalid input.
import 'dotenv/config';
import qrcode from 'qrcode-terminal';
import { createPrismaClient } from '../lib/prisma.ts';
import { AdminSetupError, resetAdmin } from '../modules/admin/admin-setup.ts';
import { PrismaAdminRepository } from '../modules/admin/admin.repository.ts';
import { hashPassword } from '../modules/admin/password.ts';
import { generateTotpSecret } from '../modules/admin/totp.ts';

/** Reads one line from the terminal without echoing it. */
function promptHidden(question: string): Promise<string> {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) throw new AdminSetupError('Run this in an interactive terminal');
  stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');

  return new Promise((resolve) => {
    let value = '';
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\u0003') {
          stdout.write('\n');
          process.exit(130); // Ctrl+C
        } else if (char === '\r' || char === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          stdout.write('\n');
          resolve(value);
          return;
        } else if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1);
        } else {
          value += char;
        }
      }
    };
    stdin.on('data', onData);
  });
}

const username = process.argv[2];
if (!username || process.argv.length > 3) {
  console.error('Usage: npm run admin:setup -- <username>');
  process.exit(1);
}

const prisma = createPrismaClient();
try {
  const password = await promptHidden('Password (min 12 characters): ');
  const confirmation = await promptHidden('Repeat password: ');
  const result = await resetAdmin(
    { admins: new PrismaAdminRepository(prisma), hashPassword, generateSecret: generateTotpSecret },
    { username, password, confirmation },
  );

  console.log(`\nAdmin "${result.username}" created. Every previous admin was removed.`);
  console.log(`TOTP secret: ${result.secret}`);
  console.log(`otpauth URI: ${result.uri}\n`);
  qrcode.generate(result.uri, { small: true }, (code) => console.log(code));
} catch (error) {
  if (!(error instanceof AdminSetupError)) throw error;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
