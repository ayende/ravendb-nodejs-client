import {SimpleRQLToken} from './RQLToken';

export class CloseSubclauseToken extends SimpleRQLToken {
  protected tokenText(): string {
    return ")";
  }
}