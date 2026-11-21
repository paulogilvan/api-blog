/** Contrato comum dos use cases: uma única operação de negócio, exposta por `execute`. */
export interface UseCase<Input, Output> {
  execute(input: Input): Promise<Output>;
}
