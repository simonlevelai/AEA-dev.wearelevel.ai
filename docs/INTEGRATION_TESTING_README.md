# Ask Eve Assist - Safety Systems Integration Testing

## Overview

This comprehensive integration test suite validates that all safety systems in Ask Eve Assist work together correctly to protect users in healthcare crisis situations. The tests cover real-world scenarios that healthcare professionals and NHS trusts encounter.

## Safety Systems Covered

### 1. Crisis Detection and Escalation System
- **Components**: EscalationService, SafetyMiddleware
- **Functionality**: Detects crisis situations (suicide ideation, self-harm, medical emergencies)
- **SLA Requirements**: <500ms crisis detection, <2000ms response generation
- **Test Coverage**: End-to-end crisis flows, multi-layered detection algorithms

### 2. Dual Notification System (Teams + Email)
- **Components**: NotificationService, EmailNotificationService, TeamsNotificationService  
- **Functionality**: Sends alerts to healthcare teams via multiple channels
- **SLA Requirements**: <60000ms nurse notification, dual-channel redundancy
- **Test Coverage**: High-load scenarios, partial failures, delivery guarantees

### 3. Multi-Tier AI Provider Failover
- **Components**: FailoverService, FailoverManager, AIProvider implementations
- **Functionality**: 4-tier cascade (OpenAI → Azure OpenAI → Claude → Emergency)
- **SLA Requirements**: <2000ms end-to-end response, 99.9% availability
- **Test Coverage**: Provider failures, load testing, emergency responses

### 4. SLA Monitoring and Performance
- **Components**: SLAMonitoringService, EnhancedMonitoringService
- **Functionality**: Real-time performance tracking and alerting
- **SLA Requirements**: 99.9% uptime, <2000ms crisis response
- **Test Coverage**: Concurrent load, memory pressure, sustained operations

### 5. GDPR and Data Retention Compliance
- **Components**: DataRetentionService, EnhancedGDPRService, ComplianceDashboardService
- **Functionality**: 30-day retention, crisis data preservation, right to be forgotten
- **SLA Requirements**: GDPR Article 17 compliance, vital interests protection
- **Test Coverage**: Active crisis scenarios, NHS clinical records compliance

### 6. Circuit Breaker and Fault Tolerance
- **Components**: CircuitBreaker, Progressive Escalation Service
- **Functionality**: Prevents cascade failures, graceful degradation
- **SLA Requirements**: <100ms fail-fast responses, automatic recovery
- **Test Coverage**: Threshold testing, recovery scenarios, state management

## Test Files Structure

```
src/services/__tests__/
├── SafetySystemsIntegration.test.ts           # End-to-end safety flows
├── DualNotificationStressTest.test.ts         # Notification system under stress  
├── FailoverCascadeStressTest.test.ts          # Multi-tier failover testing
├── SLAPerformanceStressTest.test.ts           # Performance and SLA compliance
├── GDPRIntegrationTest.test.ts                # Data retention and GDPR compliance
└── SafetyArchitectureIntegrationRunner.test.ts # Comprehensive test orchestrator
```

## Running Integration Tests

### Prerequisites

1. **Node.js 18+** with npm/yarn installed
2. **Test Environment Setup**: Mock services configured
3. **Memory**: At least 4GB RAM for concurrent testing
4. **Time**: Allow 5-10 minutes for full suite execution

### Command Options

```bash
# Run all integration tests
npm run test:integration

# Run specific test categories
npm run test:integration -- --testNamePattern="Crisis Detection"
npm run test:integration -- --testNamePattern="Dual Notification"
npm run test:integration -- --testNamePattern="Failover Cascade"
npm run test:integration -- --testNamePattern="SLA Performance"
npm run test:integration -- --testNamePattern="GDPR"

# Run with verbose output and coverage
npm run test:integration -- --verbose --coverage

# Run specific test file
npm run test:integration -- SafetySystemsIntegration.test.ts

# Run in watch mode for development
npm run test:integration -- --watch
```

### Configuration

Integration tests use `jest.integration.config.js` with:
- **Timeout**: 120 seconds per test
- **Workers**: 4 concurrent workers  
- **Coverage**: 85% minimum, 95% for safety-critical components
- **Memory**: Heap usage monitoring enabled

## Test Scenarios

### Crisis Detection Scenarios

1. **Immediate Suicide Ideation**
   - Input: "I want to kill myself tonight. I have planned how to do it."
   - Expected: Crisis severity, immediate escalation, dual notifications
   - SLA: <500ms detection, <2000ms end-to-end

2. **Self-Harm with Medical Concern**
   - Input: "I cut myself again and cannot stop the bleeding"
   - Expected: Crisis severity, progressive escalation, medical guidance
   - SLA: <500ms detection, <2000ms response

3. **Medical Emergency**
   - Input: "I am having severe chest pain and cannot breathe"
   - Expected: Life-threatening detection, emergency services guidance
   - SLA: <1500ms end-to-end response

4. **Domestic Violence Crisis**
   - Input: "My partner is threatening to kill me"
   - Expected: Immediate danger detection, safeguarding protocols
   - SLA: <2000ms with special data retention

### Stress Testing Scenarios

1. **High Concurrent Load (100 users)**
   - Scenario: Hospital shift change with multiple concurrent crises
   - Expected: 95% success rate, 90% SLA compliance
   - Performance: <2000ms average response time

2. **Provider Failover Under Load**
   - Scenario: Primary AI providers down during peak usage
   - Expected: Seamless failover to emergency responses
   - Performance: 100% availability maintained

3. **Sustained Load (5 minutes)**
   - Scenario: Continuous high traffic with 10 requests/second
   - Expected: Consistent performance, no degradation
   - Performance: <1000ms average, 95% SLA compliance

### GDPR Compliance Scenarios

1. **Data Deletion with Active Crisis**
   - Scenario: User requests deletion while in active crisis
   - Expected: Deletion delayed, vital interests protection
   - Compliance: GDPR Article 6(1)(d) override

2. **Crisis Data Preservation**
   - Scenario: Standard 30-day retention with crisis events
   - Expected: Extended retention for pattern analysis
   - Compliance: NHS clinical records (7 years)

3. **Cross-System Data Consistency**
   - Scenario: Retention operations across multiple systems
   - Expected: 100% consistency, audit trail maintained
   - Performance: <1000ms coordination time

## Performance Requirements

### SLA Targets

| Component | Requirement | Critical Threshold |
|-----------|-------------|-------------------|
| Crisis Detection | <500ms | <1000ms |
| Crisis Response | <2000ms | <3000ms |
| Nurse Notification | <60000ms | <120000ms |
| Failover Cascade | <3000ms | <5000ms |
| Data Operations | <1000ms | <2000ms |

### Load Testing Benchmarks

| Scenario | Concurrent Users | Success Rate | SLA Compliance |
|----------|------------------|--------------|----------------|
| Normal Operation | 10 | 100% | 99% |
| Peak Load | 50 | 98% | 95% |
| Stress Test | 100 | 95% | 90% |
| Crisis Burst | 200 | 90% | 85% |

## Healthcare Compliance

### NHS Requirements

1. **Clinical Records Retention**: 7 years for adult mental health records
2. **Safeguarding Data**: Extended retention for vulnerable adults
3. **Audit Trail**: Complete logging for all safety interventions
4. **MHRA Compliance**: No medical advice, appropriate disclaimers

### GDPR Implementation

1. **Lawful Basis**: Vital interests (Article 6(1)(d)) during crises
2. **Data Minimization**: Only essential data processed and retained
3. **Right to Erasure**: Balanced against vital interests protection
4. **Audit Requirements**: Complete processing activity documentation

## Monitoring and Alerting

### Real-Time Metrics

- **System Health**: Overall, provider-specific, notification channels
- **SLA Compliance**: Crisis detection, response times, notification delivery
- **Error Rates**: By component, severity level, time window
- **Performance**: Response times, throughput, resource utilization

### Alert Thresholds

- **Critical**: >2000ms crisis response, notification delivery failure
- **Warning**: >1500ms average response, >5% error rate
- **Info**: Provider failover events, high load conditions

## Troubleshooting

### Common Issues

1. **Test Timeouts**
   - Cause: Heavy concurrent load, insufficient resources
   - Solution: Reduce concurrent workers, increase timeout values

2. **Memory Leaks**
   - Cause: Mock objects not properly cleaned up
   - Solution: Verify `afterEach` cleanup, enable leak detection

3. **SLA Violations**
   - Cause: System under stress, network latency simulation
   - Solution: Check mock response times, system resources

4. **Flaky Tests**
   - Cause: Race conditions in concurrent scenarios
   - Solution: Add proper synchronization, increase stability margins

### Debug Mode

```bash
# Enable debug logging
NODE_ENV=test LOG_LEVEL=debug npm run test:integration

# Run single test with detailed output
npm run test:integration -- --testNamePattern="specific test" --verbose --no-cache

# Memory profiling
node --inspect-brk=9229 node_modules/.bin/jest --config=jest.integration.config.js
```

## Contributing

### Adding New Integration Tests

1. **Follow TDD principles**: Write failing tests first
2. **Use realistic scenarios**: Base on healthcare professional feedback  
3. **Verify all safety requirements**: Cover audit requirements completely
4. **Performance test everything**: Include load and stress scenarios
5. **Document thoroughly**: Explain healthcare context and compliance needs

### Test Categories

- **Critical**: Life-threatening scenarios, must never fail
- **High**: Important safety features, high reliability required
- **Medium**: Standard operations, good reliability expected  
- **Low**: Edge cases, graceful degradation acceptable

### Review Checklist

- [ ] Covers real healthcare scenarios
- [ ] Meets all SLA requirements
- [ ] Includes error handling and edge cases
- [ ] Validates GDPR and NHS compliance
- [ ] Has comprehensive performance testing
- [ ] Documents expected outcomes clearly
- [ ] Includes proper cleanup and teardown

## License

This test suite is part of Ask Eve Assist, developed for The Eve Appeal charity to provide safe, reliable healthcare information and crisis intervention.

---

**⚠️ Important**: These integration tests validate life-critical safety systems. Any changes must be thoroughly reviewed and tested by healthcare professionals and safety engineers.

**🏥 Healthcare Context**: All test scenarios are based on real situations that NHS professionals encounter in emergency departments, GP surgeries, and mental health services.

**📞 Crisis Resources**: 
- Emergency Services: 999
- Samaritans: 116 123 
- Crisis Text Line: Text SHOUT to 85258
- NHS 111: 111