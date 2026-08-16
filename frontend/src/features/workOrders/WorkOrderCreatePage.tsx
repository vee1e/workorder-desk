import { useNavigate } from 'react-router-dom';
import { useCreateWorkOrder } from './queries';
import { WorkOrderForm } from './WorkOrderForm';
import { PageHeader } from '../../components/primitives/Feedback';
import { Card, CardBody } from '../../components/primitives/Card';
import { messageFromError } from '../../lib/errors';

import { usePageTitle } from '../../hooks/usePageTitle';

export function WorkOrderCreatePage() {
  usePageTitle('New work order');
  const create = useCreateWorkOrder();
  const navigate = useNavigate();

  return (
    <div>
      <PageHeader kicker="Dispatch" title="New work order" description="Log a new job for the field." />
      <Card className="max-w-2xl">
        <CardBody>
          <WorkOrderForm
            submitLabel="Create work order"
            submitting={create.isPending}
            error={create.isError ? messageFromError(create.error) : null}
            onSubmit={async (values) => {
              const wo = await create.mutateAsync(values);
              navigate(`/app/work-orders/${wo.id}`);
            }}
          />
        </CardBody>
      </Card>
    </div>
  );
}