import { createInfraAdapter, infraAdapterDescriptor } from '@ankhorage/infra-r2';

const adapter = createInfraAdapter();

console.log(infraAdapterDescriptor.id, adapter.descriptor.package);
