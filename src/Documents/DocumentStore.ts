import {IDocumentStore} from './IDocumentStore';
import {IDocumentSession, ISessionOptions} from "./Session/IDocumentSession";
import {DocumentSession} from "./Session/DocumentSession";
import {RequestExecutor} from '../Http/Request/RequestExecutor';
import {EntityKeyCallback} from '../Utility/Callbacks';
import {DocumentConventions, DocumentConstructor, DocumentType} from './Conventions/DocumentConventions';
import {InvalidOperationException, RavenException} from '../Database/DatabaseExceptions';
import {IHiloKeyGenerator} from '../Hilo/IHiloKeyGenerator';
import {HiloMultiDatabaseKeyGenerator} from '../Hilo/HiloMultiDatabaseKeyGenerator';
import * as uuid from 'uuid';
import {IRavenObject} from "../Database/IRavenObject";
import {Operations} from "../Database/Operations/Operations";
import {PromiseResolver} from "../Utility/PromiseResolver";
import {TypeUtil} from "../Utility/TypeUtil";

export class DocumentStore implements IDocumentStore {
  protected url: string;  
  protected generator: IHiloKeyGenerator;
  protected initialized: boolean = false;
  protected _apiKey?: string;
  private _database: string;
  private _operations: Operations;
  private _conventions: DocumentConventions;
  private _requestExecutors: IRavenObject<RequestExecutor> = {};

  public get database(): string {
    return this._database;
  }

  public get apiKey(): string {
    return this._apiKey;
  }

  public getRequestExecutor(database?: string): RequestExecutor {
    const dbName = database || this._database;

    if (!(dbName in this._requestExecutors)) {
      this._requestExecutors[dbName] = this.createRequestExecutor(dbName);
    }

    return this._requestExecutors[dbName];
  }

  public get conventions(): DocumentConventions {
    if (!this._conventions) {
      this._conventions = new DocumentConventions();
    }

    return this._conventions;
  }

  public get operations(): Operations {
    this.assertInitialize();

    if (!this._operations) {
      this._operations = new Operations(this.getRequestExecutor());
    }

    return this._operations;
  }

  constructor(url: string, defaultDatabase: string, apiKey?: string) {
    this.url = url;
    this._database = defaultDatabase;
    this._apiKey = apiKey;
  }

  static create(url: string, defaultDatabase: string, apiKey?: string): IDocumentStore {
    return new DocumentStore(url, defaultDatabase, apiKey);
  }

  public initialize(): IDocumentStore {
    if (!this.initialized) {
      if (!this._database) {
        throw new InvalidOperationException("Default database isn't set.");
      }

      this.generator = new HiloMultiDatabaseKeyGenerator(this);
    }

    this.initialized = true;
    return this;
  }

  public async finalize(): Promise<IDocumentStore> {
    return this.generator.returnUnusedRange()
      .then((): IDocumentStore => this);
  }

  public openSession(database?: string) : IDocumentSession;
  public openSession(options?: ISessionOptions) : IDocumentSession;
  public openSession(database?: string, options?: ISessionOptions) : IDocumentSession;
  public openSession(databaseOrOptions?: string, options?: ISessionOptions) : IDocumentSession {
    this.assertInitialize();
    let database: string = <string>databaseOrOptions;
    let sessionOptions: ISessionOptions = <ISessionOptions>(options || {});

    if (TypeUtil.isObject(databaseOrOptions)) {
      sessionOptions = <ISessionOptions>databaseOrOptions;
      database = sessionOptions.database;
    }

    let dbName: string = database || this._database;
    let executor: RequestExecutor = sessionOptions.requestExecutor || this.getRequestExecutor(dbName);

    return new DocumentSession(dbName, this, executor, uuid());
  }

  public async generateId(entity: object, documentType?: DocumentType, database?: string, callback?: EntityKeyCallback): Promise<string> {
    let documentTypeName: string = <string>documentType;

    if (!TypeUtil.isString(documentType)) {
      documentType = (<DocumentConstructor>documentType).name;
    }

    return this.generator.generateDocumentKey(entity, documentType, database)
      .then((string: string) => {
        PromiseResolver.resolve<string>(string, null, callback);
        return string;
      })
      .catch((error: RavenException) => PromiseResolver.reject(error, null, callback));
  }

  protected assertInitialize(): void {
    if (!this.initialized) {
      throw new InvalidOperationException("You cannot open a session or access the _database commands\
 before initializing the document store. Did you forget calling initialize()?"
      );
    }
  }

  protected createRequestExecutor(database?: string): RequestExecutor {
    return new RequestExecutor(this.url, database || this._database, this._apiKey, this.conventions);
  }
}