import { ServiceUnavailableException } from '@nestjs/common';

export const PUSH_UNAVAILABLE_MESSAGE =
  'Resource push to S3 is not configured for this environment. Download the resource files instead.';

export class PushUnavailableException extends ServiceUnavailableException {
  constructor() {
    super(PUSH_UNAVAILABLE_MESSAGE);
  }
}
