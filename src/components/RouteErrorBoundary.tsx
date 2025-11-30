import { useRouteError, isRouteErrorResponse } from 'react-router-dom';
import { useEffect } from 'react';
import { errorReporter } from '@/lib/errorReporter';
import { ErrorBoundary as ErrorFallback } from '@/components/ErrorBoundary';
export function RouteErrorBoundary() {
  // Call the hook unconditionally at the top level to fix the lint error.
  const error = useRouteError();
  useEffect(() => {
    if (error) {
      let errorMessage = 'Unknown route error';
      let errorStack = '';
      if (isRouteErrorResponse(error)) {
        errorMessage = `Route Error ${error.status}: ${error.statusText}`;
        if (error.data) {
          errorMessage += ` - ${JSON.stringify(error.data)}`;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
        errorStack = error.stack || '';
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else {
        errorMessage = JSON.stringify(error);
      }
      errorReporter.report({
        message: errorMessage,
        stack: errorStack,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        source: 'react-router',
        error: error,
        level: "error",
      });
    }
  }, [error]);
  // Render error UI using shared ErrorFallback component
  if (isRouteErrorResponse(error)) {
    return (
      <ErrorFallback
        title={`${error.status} ${error.statusText}`}
        message="Sorry, an error occurred while loading this page."
        error={error.data ? { message: JSON.stringify(error.data, null, 2) } : error}
        statusMessage="Navigation error detected"
      />
    );
  }
  return (
    <ErrorFallback
      title="Unexpected Error"
      message="An unexpected error occurred while loading this page."
      error={error}
      statusMessage="Routing error detected"
    />
  );
}