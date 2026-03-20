import { Kafka } from 'kafkajs';

const KAFKA_BROKER = process.env.KAFKA_BROKER || 'localhost:9092';
const KAFKA_TOPICS = {
    INCIDENT_CREATED: 'mantle.incident.created',
    INCIDENT_TRIAGED: 'mantle.incident.triaged',
    INCIDENT_ASSIGNED: 'mantle.incident.assigned',
    RESPONDER_LOCATION: 'mantle.responder.location',
    AI_TRIAGE_RESULT: 'mantle.ai.triage.result',
    AI_ADVICE_GENERATED: 'mantle.ai.advice.generated',
};

const kafka = new Kafka({
    clientId: 'test-trigger',
    brokers: [KAFKA_BROKER],
});

async function runTest() {
    const producer = kafka.producer();
    const consumer = kafka.consumer({ groupId: 'test-group-' + Date.now() });

    await producer.connect();
    await consumer.connect();

    await consumer.subscribe({ topics: Object.values(KAFKA_TOPICS), fromBeginning: false });

    console.log('🚀 mantle Test Trigger Started');
    console.log(`📡 Connecting to Kafka at ${KAFKA_BROKER}`);

    // Register a mock responder first
    const responderId = 'RESP-001';
    const mockResponder = {
        id: responderId,
        name: 'Sarah Smith',
        role: 'Paramedic',
        status: 'AVAILABLE',
        organizationId: 'org-mantle',
        location: { latitude: 34.05, longitude: -118.24 },
        certifications: ['BLS', 'ACLS'],
    };

    console.log(`\n📡 Registering Responder ${responderId}...`);
    await producer.send({
        topic: KAFKA_TOPICS.RESPONDER_LOCATION,
        messages: [{ key: responderId, value: JSON.stringify(mockResponder) }],
    });

    // Listen for events
    consumer.run({
        eachMessage: async ({ topic, message }) => {
            const value = JSON.parse(message.value?.toString() || '{}');
            console.log(`\n📥 Received [${topic}]:`, JSON.stringify(value, null, 2));

            if (topic === KAFKA_TOPICS.AI_TRIAGE_RESULT) {
                console.log('✨ AI Triage Received! Result generated.');
            }
            if (topic === KAFKA_TOPICS.INCIDENT_TRIAGED) {
                console.log('🔗 Incident Triaged! State bridge working.');
            }
            if (topic === KAFKA_TOPICS.INCIDENT_ASSIGNED) {
                console.log('✅ SUCCESS: Responder Dispatched! Flow complete.');
            }
        },
    });

    // Create a mock incident
    const incidentId = `TEST-INC-${Math.floor(Math.random() * 1000)}`;
    const mockIncident = {
        id: incidentId,
        category: 'MEDICAL',
        status: 'INCOMING',
        description: 'Person collapsed in the lobby, difficulty breathing. Possible cardiac arrest.',
        location: {
            lat: 34.0522,
            lng: -118.2437,
            address: '123 Main St, Los Angeles, CA',
        },
        reporterId: 'user-001',
        createdAt: new Date().toISOString(),
    };

    console.log(`\n📤 Publishing INCIDENT_CREATED for ${incidentId}...`);
    await producer.send({
        topic: KAFKA_TOPICS.INCIDENT_CREATED,
        messages: [{ key: incidentId, value: JSON.stringify(mockIncident) }],
    });

    console.log('⏱ Waiting 10 seconds for AI processing...');
    setTimeout(async () => {
        console.log('\n🏁 Test script finished (check logs above).');
        await producer.disconnect();
        process.exit(0);
    }, 15000);
}

runTest().catch(console.error);
