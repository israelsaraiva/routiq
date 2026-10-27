import { formatErrorLocation, GraphqlError } from '../core/graphql/errors';
import { Alert, AlertDescription, AlertTitle } from './components/ui/alert';

export function GraphqlErrors({ errors }: { errors: GraphqlError[] }) {
  if (errors.length === 0) {
    return null;
  }
  return (
    <Alert variant="destructive" className="gql-errors">
      <AlertTitle>{errors.length === 1 ? '1 GraphQL error' : `${errors.length} GraphQL errors`}</AlertTitle>
      <AlertDescription>
        <ul className="gql-error-list">
          {errors.map((error, index) => (
            <li key={index}>
              <div>{error.message}</div>
              <div className="gql-error-meta">
                {[error.code, error.path && `path ${error.path}`, ...error.locations.map((location) => `at ${formatErrorLocation(location)}`)]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
