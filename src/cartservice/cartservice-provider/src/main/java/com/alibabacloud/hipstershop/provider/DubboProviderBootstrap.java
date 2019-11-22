package com.alibabacloud.hipstershop.provider;

import java.util.Map;

import com.amazonaws.xray.AWSXRay;
import com.amazonaws.xray.entities.Subsegment;
import com.amazonaws.xray.spring.aop.XRayInterceptorUtils;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Pointcut;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.stereotype.Component;


@EnableAutoConfiguration
public class DubboProviderBootstrap {

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
        @Pointcut("@within(com.amazonaws.xray.spring.aop.XRayEnabled) && bean(*Controller)")
        public void xrayEnabledClasses() {}
    }


    public static void main(String[] args) {
        new SpringApplicationBuilder(DubboProviderBootstrap.class)
                .run(args);
    }
}