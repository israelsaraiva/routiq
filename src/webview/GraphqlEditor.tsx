import { MagicWand01Icon } from '@hugeicons/core-free-icons';
import { useRef, useState } from 'react';
import { insertField } from '../core/graphql/insertField';
import { namedOperations, resolveOperationName } from '../core/graphql/operations';
import { prettifyQuery } from '../core/graphql/prettify';
import { validateVariables } from '../core/graphql/variablesValidation';
import { prettifyJson, validateJson } from '../core/jsonFormat';
import { RequestBody, RequestModel } from '../shared/types';
import { Icon } from './Icon';
import { OptionSelect } from './components/OptionSelect';
import { Button } from './components/ui/button';
import { EditorToolbar } from './CodeEditor';
import { GraphqlQueryEditor } from './GraphqlQueryEditor';
import { JsonTextEditor } from './JsonTextEditor';
import { GraphqlSchemaExplorer } from './GraphqlSchemaExplorer';
import { useGraphqlSchema } from './useGraphqlSchema';

interface Props {
  request: RequestModel;
  onChange: (patch: Partial<RequestModel>) => void;
}

function OperationSelector({ document, selected, onSelect }: { document: string; selected?: string; onSelect: (name: string) => void }) {
  const names = namedOperations(document);
  if (names.length < 2) {
    return null;
  }
  return (
    <OptionSelect
      ariaLabel="Operation name"
      value={resolveOperationName(document, selected) ?? names[0]}
      options={names.map((name) => ({ value: name, label: name }))}
      onValueChange={onSelect}
    />
  );
}

function VariablesShapeWarning({ variables }: { variables: string }) {
  const validation = validateVariables(variables);
  if (validation.valid || !validateJson(variables).valid || variables.includes('{{')) {
    return null;
  }
  return <div className="auth-status auth-status-error">Variables will be omitted: {validation.message}</div>;
}

export function GraphqlEditor({ request, onChange }: Props) {
  const { body } = request;
  const queryRef = useRef<HTMLTextAreaElement>(null);
  const { state, fetchSchema } = useGraphqlSchema(request);
  const [prettifyError, setPrettifyError] = useState<string>();
  const variables = body.graphqlVariables ?? '';

  const patchBody = (patch: Partial<RequestBody>) => onChange({ body: { ...body, ...patch } });

  const prettify = () => {
    const query = prettifyQuery(body.text);
    const formattedVariables = prettifyJson(variables);
    setPrettifyError(query.ok ? undefined : query.message);
    patchBody({
      ...(query.ok ? { text: query.text } : {}),
      ...(formattedVariables.ok ? { graphqlVariables: formattedVariables.text } : {}),
    });
  };

  const insertFromExplorer = (fieldName: string, operationKeyword: string) => {
    const caret = queryRef.current?.selectionStart ?? body.text.length;
    const edit = insertField(body.text, caret, fieldName, operationKeyword);
    patchBody({ text: edit.text });
    requestAnimationFrame(() => {
      queryRef.current?.focus();
      queryRef.current?.setSelectionRange(edit.caret, edit.caret);
    });
  };

  return (
    <div className="gql-panel">
      <div className="code-editor">
        <EditorToolbar
          leading={<OperationSelector document={body.text} selected={body.graphqlOperationName} onSelect={(name) => patchBody({ graphqlOperationName: name })} />}
          actions={
            <Button variant="ghost" size="sm" onClick={prettify}>
              <Icon icon={MagicWand01Icon} />
              Prettify
            </Button>
          }
          copyText={body.text}
        />
        <GraphqlQueryEditor value={body.text} onChange={(text) => patchBody({ text })} schema={state.schema} textareaRef={queryRef} />
      </div>
      {prettifyError && <div className="auth-status auth-status-error">{prettifyError}</div>}
      <JsonTextEditor
        title="Variables"
        ariaLabel="GraphQL variables"
        compact
        placeholder='{"id": 1}'
        text={variables}
        onChange={(graphqlVariables) => patchBody({ graphqlVariables })}
      />
      <VariablesShapeWarning variables={variables} />
      <GraphqlSchemaExplorer state={state} onFetch={fetchSchema} onInsertField={insertFromExplorer} />
    </div>
  );
}
