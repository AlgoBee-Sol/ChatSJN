import type { InferEnv, UnwrapConfig } from 'cf/config';
import type config from '../../../cloudflare.config.js';
export type Env = InferEnv<UnwrapConfig<typeof config>['worker']>;
