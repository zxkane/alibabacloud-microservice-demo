package com.alibabacloud.hipstershop;

import com.amazonaws.xray.AWSXRay;
import com.amazonaws.xray.entities.Subsegment;
import com.amazonaws.xray.javax.servlet.AWSXRayServletFilter;
import com.amazonaws.xray.spring.aop.XRayInterceptorUtils;
import com.amazonaws.xray.strategy.DynamicSegmentNamingStrategy;
import org.apache.commons.lang3.StringUtils;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Pointcut;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.openfeign.EnableFeignClients;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.stereotype.Component;

import javax.servlet.Filter;
import java.util.Map;

@EnableFeignClients
@SpringBootApplication
public class Application {

    public abstract class CustomAbstractXRayInterceptor {

        public CustomAbstractXRayInterceptor() {
        }

        @Around("xrayEnabledClasses()")
        public Object traceAroundMethods(ProceedingJoinPoint pjp) throws Throwable {
            return this.processXRayTrace(pjp);
        }

        protected Object processXRayTrace(ProceedingJoinPoint pjp) throws Throwable {
            Object var3;
            try {
                Subsegment subsegment = AWSXRay.beginSubsegment(pjp.getSignature().getName());
                if (subsegment != null) {
                    subsegment.setMetadata(this.generateMetadata(pjp, subsegment));
                }

                var3 = XRayInterceptorUtils.conditionalProceed(pjp);
            } catch (Exception var7) {
                AWSXRay.getCurrentSegment().addException(var7);
                throw var7;
            } finally {
                AWSXRay.endSubsegment();
            }

            return var3;
        }

        protected abstract void xrayEnabledClasses();

        protected Map<String, Map<String, Object>> generateMetadata(ProceedingJoinPoint pjp, Subsegment subsegment) {
            return XRayInterceptorUtils.generateMetadata(pjp, subsegment);
        }
    }


    @Aspect
    @Component
    public class XRayInspector extends CustomAbstractXRayInterceptor {
        @Override
        @Pointcut("@within(com.amazonaws.xray.spring.aop.XRayEnabled)")
        public void xrayEnabledClasses() {}
    }

    @Configuration
    public class AwsXrayConfig {

        @Value("${app.dnsNaming:}")
        private String dnsNaming;

        @Bean
        public Filter TracingFilter() {
            if (StringUtils.isNotBlank(dnsNaming)) {
                return new AWSXRayServletFilter(new DynamicSegmentNamingStrategy("eCommence", dnsNaming));
            }
            return new AWSXRayServletFilter("eCommence");
        }
    }

    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
