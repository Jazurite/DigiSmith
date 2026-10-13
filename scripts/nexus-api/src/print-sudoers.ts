// Prints the sudoers rule for the user name given as the only argument. Used by install.sh to stage the rule in the depot (never in /etc).
import { sudoersLine } from './command.ts'

const user = process.argv[2] ?? ''
process.stdout.write(sudoersLine(user) + '\n')
